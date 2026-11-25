import { botChatId } from "@/core/messaging/bots";
import { asChatId } from "@/core/messaging/testing/ids";
import { PROTOCOLS } from "@/protocols";
import { createAccountStorage } from "@/storage/account";
import { deleteAccountDatabase } from "@/storage/database";
import { useChatStore } from "../messaging/chat-store";
import { InMemoryChatSession } from "../messaging/in-memory-session";
import { InMemoryMessageStore } from "../messaging/message-store";
import { protocolChatId } from "../messaging/namespace";
import type { LinkState } from "../messaging/protocol";
import { TEST_KEYRING } from "../messaging/testing/store";
import type { ProtocolMessage } from "../messaging/types";
import { PluginRegistry } from "../plugins/registry";
import type { Plugin, PluginContext, PluginLease } from "../plugins/types";
import { AccountRuntime, type RuntimeAccount } from "./account-runtime";

function input(
  accountId: string,
  registry = new PluginRegistry(),
  createSession?: RuntimeAccount["createSession"],
  makeContext: RuntimeAccount["makeContext"] = () => ({}) as PluginContext,
): RuntimeAccount {
  return {
    accountId,
    keyring: TEST_KEYRING,
    registry,
    defaultEnabled: registry.list().map((plugin) => plugin.manifest.id),
    makeContext,
    createSession: createSession ?? (async () => new InMemoryChatSession()),
    storage: { ...createAccountStorage(accountId), messages: new InMemoryMessageStore() },
  };
}

const ACCOUNTS = ["account-a", "account-b"];

beforeEach(async () => {
  for (const id of ACCOUNTS) await deleteAccountDatabase(id);
  useChatStore.setState({
    status: "idle",
    sessions: {},
    protocols: {},
    accountId: null,
    accountStorage: null,
    messageStore: null,
    chats: [],
    messages: {},
    bots: {},
    readAt: {},
  });
});

describe("AccountRuntime", () => {
  it("routes protocol deletions to the loaded chat", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const session = new InMemoryChatSession();
    session.seedChat({ id: "chat" });
    let deleted!: (id: string, ids: string[]) => void;
    Object.assign(session, {
      streamDeletedMessages: async (listener: typeof deleted) => {
        deleted = listener;
        return () => {};
      },
    });
    await runtime.synchronize(input("deletion-test", new PluginRegistry(), async () => session));
    await useChatStore.getState().loadMessages(asChatId("xmtp-chat"));
    session.deliver("chat", { id: "message", content: { kind: "text", text: "bye" } });
    deleted("chat", ["message"]);
    expect(useChatStore.getState().messages[asChatId("xmtp-chat")]).toEqual([]);
    await runtime.synchronize(null);
  });

  it("keeps Saved Messages available without a plugin", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const session = new InMemoryChatSession();
    session.seedChat({ id: "chat", createdAt: 1 });
    await runtime.synchronize(input("saved-account", new PluginRegistry(), async () => session));
    expect(useChatStore.getState().chats.map((c) => c.id)).toEqual(["xmtp-chat", "local-saved"]);
    await useChatStore.getState().sendMessage(botChatId("saved"), { kind: "text", text: "remember" });
    expect(useChatStore.getState().messages[botChatId("saved")]).toEqual([
      expect.objectContaining({ content: { kind: "text", text: "remember" } }),
    ]);
    await runtime.synchronize(null);
  });

  it("switches projection before an unfinished old start resolves", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const oldSession = new InMemoryChatSession();
    const newSession = new InMemoryChatSession();
    let finish!: (session: InMemoryChatSession) => void;
    let entered!: () => void;
    const creating = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<InMemoryChatSession>((resolve) => {
      finish = resolve;
    });

    const starting = runtime.synchronize(
      input("account-a", new PluginRegistry(), async () => {
        entered();
        return pending;
      }),
    );
    await creating;
    expect(useChatStore.getState().accountId).toBe("account-a");

    const switching = runtime.synchronize(input("account-b", new PluginRegistry(), async () => newSession));
    expect(useChatStore.getState().accountId).toBeNull();
    await switching;

    expect(useChatStore.getState().accountId).toBe("account-b");
    expect(useChatStore.getState().sessions.xmtp).toBe(newSession);

    finish(oldSession);
    await starting;

    expect(oldSession.disconnected).toBe(true);
    expect(useChatStore.getState().accountId).toBe("account-b");
    expect(useChatStore.getState().sessions.xmtp).toBe(newSession);
    await runtime.synchronize(null);
  });

  it("erases without waiting for stale session startup", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const lateSession = new InMemoryChatSession();
    let finish!: (session: InMemoryChatSession) => void;
    let entered!: () => void;
    const creating = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<InMemoryChatSession>((resolve) => {
      finish = resolve;
    });
    const starting = runtime.synchronize(
      input("account-a", new PluginRegistry(), async () => {
        entered();
        return pending;
      }),
    );
    await creating;

    const erasing = runtime.erase({
      id: "account-a",
      label: "A",
      address: "0x0000000000000000000000000000000000000001",
      createdAt: 1,
      kind: "phrase",
    });
    expect(useChatStore.getState().status).toBe("erasing");
    expect(useChatStore.getState().accountId).toBeNull();
    await erasing;

    finish(lateSession);
    await starting;
    expect(lateSession.disconnected).toBe(true);
    expect(useChatStore.getState().accountId).toBeNull();
  });

  it("rejects callbacks retained by an outgoing account stream", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const session = new InMemoryChatSession();
    session.seedChat({ id: "old" });
    let staleMessage!: (message: ProtocolMessage) => void;
    jest.spyOn(session, "streamMessages").mockImplementation(async (listener) => {
      staleMessage = listener;
      return () => {};
    });

    await runtime.synchronize(input("account-a", new PluginRegistry(), async () => session));
    await runtime.synchronize(input("account-b"));
    staleMessage({
      id: "late",
      chatId: protocolChatId("old"),
      senderId: "them",
      sentAt: 1,
      content: { kind: "text", text: "old account" },
      fromMe: false,
      status: "sent",
    });

    expect(useChatStore.getState().accountId).toBe("account-b");
    expect(useChatStore.getState().messages[asChatId("xmtp-old")]).toBeUndefined();
    await runtime.synchronize(null);
  });

  it("disposes a bot whose activation resolves after an account switch", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const dispose = jest.fn();
    let finish!: (dispose: () => void) => void;
    const activated = new Promise<() => void>((resolve) => {
      finish = resolve;
    });
    const plugin: Plugin = {
      manifest: {
        id: "ticker",
        name: "Ticker",
        description: "",
        version: "1",
        icon: "circle",
        permissions: [],
      },
      setup: () => ({
        bots: [
          {
            id: "ticker",
            name: "Ticker",
            tagline: "",
            greeting: () => [],
            activate: async () => activated,
          },
        ],
      }),
    };

    await runtime.synchronize(input("account-a", new PluginRegistry([plugin])));
    await Promise.resolve();
    const switching = runtime.synchronize(input("account-b"));
    finish(dispose);
    await switching;

    expect(dispose).toHaveBeenCalledTimes(1);
    await runtime.synchronize(null);
  });

  it("revokes plugin leases on deactivate and rejects in-flight work after switch", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const plugin: Plugin = {
      manifest: {
        id: "leased",
        name: "Leased",
        description: "",
        version: "1",
        icon: "circle",
        permissions: [],
      },
      setup: () => ({}),
    };
    const registry = new PluginRegistry([plugin]);
    let lease!: PluginLease;
    await runtime.synchronize(
      input("account-a", registry, undefined, (_plugin, _accountId, _keyring, _storage, activeLease) => {
        lease = activeLease;
        return {} as PluginContext;
      }),
    );

    let finish!: (value: string) => void;
    const work = lease.guard(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const switching = runtime.synchronize(input("account-b"));
    finish("old account");

    await expect(work).rejects.toThrow("no longer active");
    await switching;

    await runtime.synchronize(
      input("account-a", registry, undefined, (_plugin, _accountId, _keyring, _storage, activeLease) => {
        lease = activeLease;
        return {} as PluginContext;
      }),
    );
    await runtime.setPluginEnabled("leased", false);
    expect(() => lease.assertActive()).toThrow("no longer active");
    await runtime.synchronize(null);
  });

  it("reconnects only the protocols that read plugin content types", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const first = new InMemoryChatSession();
    const second = new InMemoryChatSession();
    const nostr = new InMemoryChatSession();
    const sessions = [first, second];
    const plugin: Plugin = {
      manifest: {
        id: "codec",
        name: "Codec",
        description: "",
        version: "1",
        icon: "circle",
        permissions: [],
        requiresSessionRestart: true,
      },
      setup: () => ({}),
    };

    await runtime.synchronize({
      ...input("account-a", new PluginRegistry([plugin]), async ({ protocolId }) =>
        protocolId === "nostr" ? nostr : sessions.shift()!,
      ),
      only: ["xmtp", "nostr"],
    });
    await runtime.setPluginEnabled("codec", false);
    await runtime["transition"];

    expect(first.disconnected).toBe(true);
    expect(useChatStore.getState().sessions.xmtp).toBe(second);
    expect(nostr.disconnected).toBe(false);
    expect(useChatStore.getState().sessions.nostr).toBe(nostr);
    await runtime.synchronize(null);
  });

  it("connects protocols that need no plugin while plugins are still starting", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const xmtp = new InMemoryChatSession();
    const nostr = new InMemoryChatSession();
    let release!: () => void;
    const starting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: Plugin = {
      manifest: {
        id: "slow",
        name: "Slow",
        description: "",
        version: "1",
        icon: "circle",
        permissions: [],
      },
      setup: () => ({ start: () => starting }),
    };

    const running = runtime.synchronize({
      ...input("account-a", new PluginRegistry([slow]), async ({ protocolId }) =>
        protocolId === "nostr" ? nostr : xmtp,
      ),
      only: ["xmtp", "nostr"],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(useChatStore.getState().sessions.nostr).toBe(nostr);
    expect(useChatStore.getState().sessions.xmtp).toBeUndefined();
    release();
    await running;
    expect(useChatStore.getState().sessions.xmtp).toBe(xmtp);
    await runtime.synchronize(null);
  });

  it("saves protocol settings without waiting to reconnect, and reconnects only that protocol", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const xmtp = new InMemoryChatSession();
    const nostr = new InMemoryChatSession();
    const reconnected = new InMemoryChatSession();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let nostrStarts = 0;

    await runtime.synchronize({
      ...input("account-a", new PluginRegistry(), async ({ protocolId }) => {
        if (protocolId === "xmtp") return xmtp;
        if (nostrStarts++ === 0) return nostr;
        await held;
        return reconnected;
      }),
      only: ["xmtp", "nostr"],
    });
    await runtime.updateProtocolConfig("account-a", "nostr", { relays: "wss://relay.example" });
    release();
    await runtime["transition"];

    expect(nostr.disconnected).toBe(true);
    expect(useChatStore.getState().sessions.nostr).toBe(reconnected);
    expect(xmtp.disconnected).toBe(false);
    expect(useChatStore.getState().sessions.xmtp).toBe(xmtp);
    await runtime.synchronize(null);
  });
});

describe("AccountRuntime recovery", () => {
  function linked(session: InMemoryChatSession) {
    let report!: (link: LinkState) => void;
    Object.assign(session, {
      subscribeLink: (listener: (link: LinkState) => void) => {
        report = listener;
        listener("online");
        return () => {};
      },
    });
    return (link: LinkState) => report(link);
  }

  afterEach(() => jest.useRealTimers());

  it("retries a protocol that failed to connect, on its own and again when the app comes back", async () => {
    jest.useFakeTimers();
    const runtime = new AccountRuntime(PROTOCOLS);
    const session = new InMemoryChatSession();
    let attempts = 0;
    await runtime.synchronize(
      input("account-a", new PluginRegistry(), async () => {
        attempts++;
        if (attempts < 3) throw new Error("offline");
        return session;
      }),
    );
    expect(useChatStore.getState().protocols.xmtp?.status).toBe("error");

    await jest.advanceTimersByTimeAsync(5_000);
    await runtime["transition"];
    expect(attempts).toBe(2);
    expect(useChatStore.getState().protocols.xmtp?.status).toBe("error");

    runtime.resume();
    await runtime["transition"];
    expect(attempts).toBe(3);
    expect(useChatStore.getState().sessions.xmtp).toBe(session);
    expect(useChatStore.getState().protocols.xmtp?.status).toBe("ready");
    expect(useChatStore.getState().status).toBe("ready");
    await runtime.synchronize(null);
  });

  it("replaces a lost session and keeps its chats on screen meanwhile", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const first = new InMemoryChatSession();
    first.seedChat({ id: "chat" });
    const report = linked(first);
    const second = new InMemoryChatSession();
    second.seedChat({ id: "chat" });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let starts = 0;
    await runtime.synchronize(
      input("account-a", new PluginRegistry(), async () => {
        if (starts++ === 0) return first;
        await held;
        return second;
      }),
    );
    expect(useChatStore.getState().chats.map((chat) => chat.id)).toContain("xmtp-chat");

    report("lost");
    await new Promise((resolve) => setImmediate(resolve));
    expect(first.disconnected).toBe(true);
    expect(useChatStore.getState().protocols.xmtp?.status).toBe("connecting");
    expect(useChatStore.getState().chats.map((chat) => chat.id)).toContain("xmtp-chat");

    release();
    await runtime["transition"];
    expect(useChatStore.getState().sessions.xmtp).toBe(second);
    expect(useChatStore.getState().protocols.xmtp?.status).toBe("ready");
    expect(useChatStore.getState().status).toBe("ready");
    await runtime.synchronize(null);
  });

  it("waits longer each time a replaced session is lost again soon after", async () => {
    jest.useFakeTimers();
    const runtime = new AccountRuntime(PROTOCOLS);
    const sessions = [new InMemoryChatSession(), new InMemoryChatSession(), new InMemoryChatSession()];
    const reports = sessions.map(linked);
    let starts = 0;
    await runtime.synchronize(input("account-a", new PluginRegistry(), async () => sessions[starts++]));

    reports[0]("lost");
    await jest.advanceTimersByTimeAsync(0);
    await runtime["transition"];
    expect(useChatStore.getState().sessions.xmtp).toBe(sessions[1]);

    reports[1]("lost");
    await jest.advanceTimersByTimeAsync(14_999);
    expect(useChatStore.getState().sessions.xmtp).toBe(sessions[1]);
    await jest.advanceTimersByTimeAsync(1);
    await runtime["transition"];
    expect(useChatStore.getState().sessions.xmtp).toBe(sessions[2]);
    await runtime.synchronize(null);
  });

  it("keeps lengthening the wait while a link drops right after it comes back", async () => {
    jest.useFakeTimers();
    const runtime = new AccountRuntime(PROTOCOLS);
    const session = new InMemoryChatSession();
    const resume = jest.fn(async () => {
      report("online");
      return false;
    });
    Object.assign(session, { resume });
    const report = linked(session);
    await runtime.synchronize(input("account-a", new PluginRegistry(), async () => session));

    report("reconnecting");
    await jest.advanceTimersByTimeAsync(5_000);
    expect(resume).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_000);
    report("reconnecting");
    await jest.advanceTimersByTimeAsync(14_999);
    expect(resume).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(resume).toHaveBeenCalledTimes(2);
    await runtime.synchronize(null);
  });

  it("shows a protocol as connecting only when its link stays down", async () => {
    jest.useFakeTimers();
    const runtime = new AccountRuntime(PROTOCOLS);
    const session = new InMemoryChatSession();
    Object.assign(session, { resume: async () => false });
    const report = linked(session);
    await runtime.synchronize(input("account-a", new PluginRegistry(), async () => session));

    report("reconnecting");
    await jest.advanceTimersByTimeAsync(1_000);
    report("online");
    await jest.advanceTimersByTimeAsync(5_000);
    expect(useChatStore.getState().protocols.xmtp?.status).toBe("ready");

    const syncs = session.syncCount;
    report("reconnecting");
    await jest.advanceTimersByTimeAsync(5_000);
    expect(useChatStore.getState().protocols.xmtp?.status).toBe("connecting");
    report("online");
    await jest.advanceTimersByTimeAsync(0);
    expect(useChatStore.getState().protocols.xmtp?.status).toBe("ready");
    expect(session.syncCount).toBe(syncs + 1);
    await runtime.synchronize(null);
  });

  it("asks a session whose link is down to resume on the retry schedule until it is back", async () => {
    jest.useFakeTimers();
    const runtime = new AccountRuntime(PROTOCOLS);
    const session = new InMemoryChatSession();
    const resume = jest.fn(async () => false);
    Object.assign(session, { resume });
    const report = linked(session);
    await runtime.synchronize(input("account-a", new PluginRegistry(), async () => session));

    report("reconnecting");
    await jest.advanceTimersByTimeAsync(4_999);
    expect(resume).toHaveBeenCalledTimes(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(resume).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(resume).toHaveBeenCalledTimes(2);

    report("online");
    await jest.advanceTimersByTimeAsync(600_000);
    expect(resume).toHaveBeenCalledTimes(2);

    report("reconnecting");
    await jest.advanceTimersByTimeAsync(5_000);
    expect(resume).toHaveBeenCalledTimes(3);
    await runtime.synchronize(null);
    await jest.advanceTimersByTimeAsync(600_000);
    expect(resume).toHaveBeenCalledTimes(3);
  });

  it("resumes at most once in a short while, and catches up only on what was reopened", async () => {
    jest.useFakeTimers();
    const runtime = new AccountRuntime(PROTOCOLS);
    const session = new InMemoryChatSession();
    const resume = jest.fn(async () => true);
    Object.assign(session, { resume });
    await runtime.synchronize(input("account-a", new PluginRegistry(), async () => session));
    const syncs = session.syncCount;

    runtime.resume();
    runtime.resume();
    await jest.advanceTimersByTimeAsync(0);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(session.syncCount).toBe(syncs + 1);

    resume.mockResolvedValue(false);
    await jest.advanceTimersByTimeAsync(10_000);
    runtime.resume();
    await jest.advanceTimersByTimeAsync(0);
    expect(resume).toHaveBeenCalledTimes(2);
    expect(session.syncCount).toBe(syncs + 1);
    await runtime.synchronize(null);
  });

  it("asks sessions to resume and replaces one that cannot", async () => {
    const runtime = new AccountRuntime(PROTOCOLS);
    const first = new InMemoryChatSession();
    const resume = jest.fn().mockRejectedValue(new Error("gone"));
    Object.assign(first, { resume });
    const second = new InMemoryChatSession();
    let starts = 0;
    await runtime.synchronize(input("account-a", new PluginRegistry(), async () => (starts++ ? second : first)));

    runtime.resume();
    await new Promise((resolve) => setImmediate(resolve));
    await runtime["transition"];
    expect(resume).toHaveBeenCalled();
    expect(useChatStore.getState().sessions.xmtp).toBe(second);
    await runtime.synchronize(null);
  });
});
