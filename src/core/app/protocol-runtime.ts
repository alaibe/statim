import type { LocalAccount } from "viem";
import type { AccountStorage } from "@/storage/account";
import { chatKeys, type DerivedKey, type Keyring } from "../account/keyring";
import { errorMessage } from "../errors";
import { Backoff } from "../messaging/backoff";
import type { ChatCache } from "../messaging/chat-cache";
import { connectionFor, NO_CONNECTION, type ProtocolConnection, useChatStore } from "../messaging/chat-store";
import { loadProtocolConfigs } from "../messaging/config";
import {
  LOCAL_PROTOCOL,
  namespaceChat,
  namespacedId,
  namespaceMessage,
  type ProtocolId,
  protocolOf,
} from "../messaging/namespace";
import type { ChatSession, CustomContentType, LinkState } from "../messaging/protocol";
import { connectableProtocols, effectiveConfig, isConfigured, type ProtocolDescriptor } from "../messaging/registry";
import type { Chat, ProtocolChat, Unsubscribe } from "../messaging/types";

export type SessionFactory = (params: {
  protocolId: ProtocolId;
  account: LocalAccount;
  derive(path: string): DerivedKey;
  contentTypes: CustomContentType[];
}) => Promise<ChatSession>;

interface ProtocolAccount {
  accountId: string;
  keyring: Pick<Keyring, "account" | "chatKey">;
  contentTypes(): CustomContentType[];
  createSession?: SessionFactory;
  only?: ProtocolId[];
  /** Settles once plugins are active. */
  plugins?: Promise<void>;
  cache?: ChatCache;
}

interface Connecting {
  input: ProtocolAccount;
  storage: AccountStorage;
  active: () => boolean;
}

const RESUME_GAP_MS = 10_000;

/** TDLib and the Matrix SDK drop and restore their link often; only a drop that lasts shows. */
const RECONNECTING_GRACE_MS = 3_000;

export class ProtocolRuntime {
  private subscriptions = new Map<ProtocolId, Unsubscribe[]>();
  private sessions = new Map<ProtocolId, ChatSession>();
  private context: Connecting | null = null;
  private readonly backoffs = new Map<ProtocolId, Backoff>();
  private readonly retries = new Map<ProtocolId, { timer: ReturnType<typeof setTimeout>; lost?: ChatSession }>();
  private resumedAt = -Infinity;
  private readonly resuming = new Set<ProtocolId>();

  /** `recover` replaces a protocol's `lost` session, or connects it when it has none; the caller serializes it. */
  constructor(
    private readonly descriptors: readonly ProtocolDescriptor[],
    private readonly recover: (protocolId: ProtocolId, lost?: ChatSession) => void,
  ) {}

  private get cache(): ChatCache | undefined {
    return this.context?.input.cache;
  }

  async connect(
    input: ProtocolAccount,
    storage: AccountStorage,
    active: () => boolean,
    only?: ProtocolId[],
  ): Promise<void> {
    if (!active()) return;
    this.context = { input, storage, active };
    useChatStore.setState({ status: "connecting", error: null });
    const selected = input.only ?? (input.createSession ? ["xmtp" as const] : undefined);
    const descriptors = connectableProtocols(this.descriptors).filter(
      (descriptor) => (!selected || selected.includes(descriptor.id)) && (!only || only.includes(descriptor.id)),
    );

    const configs = configsFor(input);
    await Promise.all(descriptors.map((descriptor) => this.connectOne(descriptor, configs)));

    if (active()) this.rollUpStatus();
  }

  /** Swaps a session that died for a new one, keeping the protocol's chats and messages on screen. */
  async replace(protocolId: ProtocolId, lost?: ChatSession): Promise<void> {
    const context = this.context;
    const descriptor = this.descriptors.find((entry) => entry.id === protocolId);
    const current = this.sessions.get(protocolId);
    if (!context?.active() || !descriptor || (lost ? current !== lost : current)) return;
    this.cancelRetry(protocolId);
    await this.dropSession(protocolId);
    await this.connectOne(descriptor, configsFor(context.input));
    if (context.active()) this.rollUpStatus();
  }

  resume(): void {
    const now = Date.now();
    if (!this.context?.active() || now - this.resumedAt < RESUME_GAP_MS) return;
    this.resumedAt = now;
    for (const [protocolId, session] of this.sessions) void this.resumeOne(protocolId, session);
    for (const [protocolId, retry] of this.retries) {
      clearTimeout(retry.timer);
      this.recover(protocolId, retry.lost);
    }
    this.retries.clear();
  }

  /** Asks a session to reopen what dropped and fetches its chats again if it missed something; a session that cannot is replaced. */
  private async resumeOne(protocolId: ProtocolId, session: ChatSession): Promise<void> {
    if (this.resuming.has(protocolId)) return;
    this.resuming.add(protocolId);
    try {
      const behind = await (session.resume?.() ?? Promise.resolve(true));
      if (behind && this.sessions.get(protocolId) === session) await useChatStore.getState().syncProtocol(protocolId);
    } catch {
      this.recover(protocolId, session);
    } finally {
      this.resuming.delete(protocolId);
    }
  }

  private async connectOne(descriptor: ProtocolDescriptor, configs: ReturnType<typeof configsFor>): Promise<void> {
    const context = this.context;
    if (!context?.active()) return;
    const { input, storage, active } = context;
    const protocolId = descriptor.id;
    const subscriptions: Unsubscribe[] = [];
    this.subscriptions.set(protocolId, subscriptions);
    this.setProtocol(protocolId, { ...NO_CONNECTION, status: "connecting" });
    let session: ChatSession | null = null;
    try {
      session = await this.open(descriptor, input, storage, configs, active);
      if (!session) return;
      if (!active()) {
        await session.disconnect().catch(() => {});
        return;
      }
      const current = session;
      this.sessions.set(protocolId, current);
      useChatStore.setState((state) => ({
        sessions: { ...state.sessions, [protocolId]: current },
      }));
      this.setProtocol(protocolId, { ...NO_CONNECTION, status: "ready" });
      const live = () => active() && this.sessions.get(protocolId) === current;

      subscriptions.push(...this.watch(protocolId, current, live));
      const streams = await this.stream(protocolId, current, live);
      if (!live()) {
        for (const stop of streams) stop?.();
        await current.disconnect().catch(() => {});
        return;
      }
      for (const stop of streams) if (stop) subscriptions.push(stop);
      await this.list(protocolId, current, live);
      if (!live()) return;
      this.backoff(protocolId).up();
      await useChatStore.getState().syncProtocol(protocolId);
    } catch (error) {
      if (!active()) return;
      if (session && this.sessions.get(protocolId) === session) await this.dropSession(protocolId);
      this.setProtocol(protocolId, { ...NO_CONNECTION, status: "error", error: errorMessage(error) });
      this.retry(protocolId, this.backoff(protocolId).next());
    }
  }

  /** A session for `descriptor`, or null when the account changed or the protocol is not set up. */
  private async open(
    descriptor: ProtocolDescriptor,
    input: ProtocolAccount,
    storage: AccountStorage,
    configs: ReturnType<typeof configsFor>,
    active: () => boolean,
  ): Promise<ChatSession | null> {
    const protocolId = descriptor.id;
    if (descriptor.usesPluginContentTypes) await input.plugins;
    if (!active()) return null;
    if (input.createSession) {
      return input.createSession({
        protocolId,
        account: input.keyring.account,
        derive: chatKeys(input.keyring),
        contentTypes: input.contentTypes(),
      });
    }
    const stored = (await configs)?.[protocolId] ?? {};
    if (!active()) return null;
    const config = effectiveConfig(descriptor, stored);
    if (!isConfigured(descriptor, config)) {
      this.cache?.forget(protocolId);
      this.setProtocol(protocolId, NO_CONNECTION);
      return null;
    }
    return descriptor.connect!({
      accountId: input.accountId,
      account: input.keyring.account,
      derive: chatKeys(input.keyring),
      contentTypes: input.contentTypes(),
      config,
      storage,
    });
  }

  private async dropSession(protocolId: ProtocolId): Promise<void> {
    await this.disconnect([protocolId]);
    useChatStore.setState((state) => {
      const { [protocolId]: _dropped, ...sessions } = state.sessions;
      return { sessions };
    });
  }

  private backoff(protocolId: ProtocolId): Backoff {
    let backoff = this.backoffs.get(protocolId);
    if (!backoff) {
      backoff = new Backoff();
      this.backoffs.set(protocolId, backoff);
    }
    return backoff;
  }

  /** Connects `protocolId` again after `wait`, replacing `lost` if it is still the protocol's session. */
  private retry(protocolId: ProtocolId, wait: number, lost?: ChatSession): void {
    this.cancelRetry(protocolId);
    if (wait === 0) return this.recover(protocolId, lost);
    const timer = setTimeout(() => {
      this.retries.delete(protocolId);
      this.recover(protocolId, lost);
    }, wait);
    this.retries.set(protocolId, { timer, lost });
  }

  private cancelRetry(protocolId: ProtocolId): void {
    const retry = this.retries.get(protocolId);
    if (retry) clearTimeout(retry.timer);
    this.retries.delete(protocolId);
  }

  private watch(protocolId: ProtocolId, session: ChatSession, live: () => boolean): Unsubscribe[] {
    const subscriptions: Unsubscribe[] = [];
    if (session.subscribeHistory) {
      subscriptions.push(
        session.subscribeHistory((history) => {
          if (!live()) return;
          this.setProtocol(protocolId, {
            ...connectionFor(useChatStore.getState().protocols, protocolId),
            history,
          });
        }),
      );
    }
    if (session.subscribeLogin) {
      subscriptions.push(
        session.subscribeLogin((login) => {
          if (!live()) return;
          if (login) this.cache?.forget(protocolId);
          this.setProtocol(protocolId, {
            ...connectionFor(useChatStore.getState().protocols, protocolId),
            login,
          });
        }),
      );
    }
    if (session.subscribeLink) {
      const status = (status: ProtocolConnection["status"]) =>
        this.setProtocol(protocolId, { ...connectionFor(useChatStore.getState().protocols, protocolId), status });
      const backoff = this.backoff(protocolId);
      const reconnection = new Reconnection(backoff, {
        show: (connection) => {
          if (live()) status(connection);
        },
        resume: () => (live() ? this.resumeOne(protocolId, session) : Promise.resolve()),
        caughtUp: () => {
          if (live()) void useChatStore.getState().syncProtocol(protocolId);
        },
        lost: () => {
          if (live()) this.retry(protocolId, backoff.next(0), session);
        },
      });
      subscriptions.push(
        () => reconnection.dispose(),
        session.subscribeLink((link) => {
          if (live()) reconnection.update(link);
        }),
      );
    }
    return subscriptions;
  }

  private stream(protocolId: ProtocolId, session: ChatSession, live: () => boolean) {
    const streamed: Chat[] = [];
    return Promise.all([
      session.streamMessages((message) => {
        if (live()) useChatStore.getState().ingestMessage(namespaceMessage(protocolId, message));
      }),
      session.streamDeletedMessages?.((id, messageIds) => {
        if (live()) useChatStore.getState().removeMessages(namespacedId(protocolId, id), messageIds);
      }),
      session.streamChats((chat) => {
        if (streamed.length === 0) {
          queueMicrotask(() => {
            const batch = streamed.splice(0);
            if (live()) useChatStore.getState().ingestChats(batch);
          });
        }
        streamed.push(namespaceChat(protocolId, chat));
      }),
    ]);
  }

  private async list(protocolId: ProtocolId, session: ChatSession, live: () => boolean): Promise<void> {
    const first = await session.listChats();
    if (!live()) return;
    const namespaced = (list: ProtocolChat[]) => list.map((chat) => namespaceChat(protocolId, chat));
    const chats = namespaced(first);
    useChatStore.getState().ingestChats(chats);
    if (session.whenListed && this.cache) {
      void session
        .whenListed(first)
        .then((everything) => {
          if (!live()) return;
          const listed = everything === first ? chats : namespaced(everything);
          if (listed !== chats) useChatStore.getState().ingestChats(listed);
          this.cache?.listed(protocolId, listed);
        })
        .catch(() => {});
    }
  }

  /** Drops the protocol projection of `only` (every protocol by default) but keeps local chats. */
  async stop(only?: ProtocolId[]): Promise<void> {
    for (const protocol of only ?? this.sessions.keys()) this.cache?.pause(protocol);
    for (const protocol of only ?? []) {
      this.cancelRetry(protocol);
      this.backoffs.delete(protocol);
    }
    await this.disconnect(only);
    const state = useChatStore.getState();
    const dropped = (protocol: ProtocolId) => (only ? only.includes(protocol) : protocol !== LOCAL_PROTOCOL);
    const keep = <K extends string, T>(record: Partial<Record<K, T>>, ownerOf: (key: K) => ProtocolId) =>
      Object.fromEntries((Object.entries(record) as [K, T][]).filter(([key]) => !dropped(ownerOf(key))));
    const ownProtocol = (key: ProtocolId) => key;
    useChatStore.setState({
      status: only ? state.status : "idle",
      error: only ? state.error : null,
      sessions: keep(state.sessions, ownProtocol),
      protocols: keep(state.protocols, ownProtocol),
      syncing: only ? state.syncing : false,
      chats: state.chats.filter((chat) => !dropped(chat.protocol)),
      messages: keep(state.messages, protocolOf),
      rawMessages: keep(state.rawMessages, protocolOf),
      messageHistory: keep(state.messageHistory, protocolOf),
    });
  }

  async disconnect(only?: ProtocolId[]): Promise<void> {
    const ids = only ?? [...new Set([...this.subscriptions.keys(), ...this.sessions.keys()])];
    const sessions: ChatSession[] = [];
    for (const id of ids) {
      for (const unsubscribe of this.subscriptions.get(id) ?? []) {
        try {
          unsubscribe();
        } catch {}
      }
      this.subscriptions.delete(id);
      const session = this.sessions.get(id);
      if (session) sessions.push(session);
      this.sessions.delete(id);
    }
    if (!only) {
      this.context = null;
      for (const retry of this.retries.values()) clearTimeout(retry.timer);
      this.retries.clear();
      this.backoffs.clear();
    }
    await Promise.all(sessions.map((session) => session.disconnect().catch(() => {})));
  }

  private setProtocol(id: ProtocolId, connection: ProtocolConnection): void {
    useChatStore.setState((state) => ({ protocols: { ...state.protocols, [id]: connection } }));
  }

  private rollUpStatus(): void {
    const state = useChatStore.getState();
    const connections = Object.values(state.protocols);
    const failures = connections.filter((connection) => connection.status === "error");
    if (this.sessions.size > 0) {
      useChatStore.setState({ status: "ready", error: failures[0]?.error ?? null });
    } else if (failures.length > 0) {
      useChatStore.setState({ status: "error", error: failures[0].error });
    } else {
      useChatStore.setState({ status: "idle", error: null });
    }
  }
}

function configsFor(input: ProtocolAccount) {
  return input.createSession ? undefined : loadProtocolConfigs(input.accountId);
}

/**
 * While a session's link is down: shows it once the drop lasts, and asks the
 * session to resume on the protocol's backoff until the link is back.
 */
class Reconnection {
  private down = false;
  private shown = false;
  private grace: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly backoff: Backoff,
    private readonly hooks: {
      show(status: ProtocolConnection["status"]): void;
      resume(): Promise<void>;
      caughtUp(): void;
      lost(): void;
    },
  ) {}

  update(link: LinkState): void {
    if (link === "lost") {
      this.clearTimers();
      this.hooks.show("connecting");
      this.hooks.lost();
    } else if (link === "online") {
      if (this.down) this.backoff.up();
      this.clearTimers();
      this.down = false;
      if (!this.shown) return;
      this.shown = false;
      this.hooks.show("ready");
      this.hooks.caughtUp();
    } else if (!this.down) {
      this.down = true;
      this.grace = setTimeout(() => {
        this.grace = null;
        this.shown = true;
        this.hooks.show("connecting");
      }, RECONNECTING_GRACE_MS);
      this.scheduleRetry();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  private scheduleRetry(): void {
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.hooks.resume().then(() => {
        if (this.down && !this.disposed && !this.retry) this.scheduleRetry();
      });
    }, this.backoff.next());
  }

  private clearTimers(): void {
    if (this.grace) clearTimeout(this.grace);
    if (this.retry) clearTimeout(this.retry);
    this.grace = null;
    this.retry = null;
  }
}
