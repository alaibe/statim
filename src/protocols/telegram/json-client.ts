import { type TdApi, type TdError, type TdObject, TdRequestError } from "./api";
import type { TdUpdate } from "./types";

/** The calls a platform makes into `td_json_client`; everything above them is shared. */
export interface TdDriver {
  create(): Promise<void>;
  send(request: TdObject): Promise<void>;
  /** What TDLib said, oldest first; empty when it had nothing to say within the driver's own timeout. */
  receive(): Promise<TdObject[]>;
  destroy(): Promise<void>;
}

interface Pending {
  resolve(value: TdObject): void;
  reject(error: Error): void;
}

const EXTRA_PREFIX = "so-";

let active: TdJsonClient | null = null;

/** Each platform holds one client, so creating a new one closes the last. */
export class TdJsonClient implements TdApi {
  private nextId = 1;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Set<(update: TdObject) => void>();
  private readonly lostListeners = new Set<() => void>();
  private state: "open" | "closing" | "closed" = "open";
  private resolveClosed: (() => void) | null = null;
  private readonly closed = new Promise<void>((resolve) => {
    this.resolveClosed = resolve;
  });

  private constructor(private readonly driver: TdDriver) {}

  static async create(driver: TdDriver): Promise<TdJsonClient> {
    if (active) await active.close();
    await driver.create();
    const client = new TdJsonClient(driver);
    active = client;
    void client.receiveLoop();
    return client;
  }

  onUpdate(listener: (update: TdObject) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onLost(listener: () => void): () => void {
    this.lostListeners.add(listener);
    return () => this.lostListeners.delete(listener);
  }

  send<T extends TdObject = TdObject>(request: TdObject): Promise<T> {
    if (this.state !== "open") return Promise.reject(new Error("TDLib client is closed"));
    const extra = `${EXTRA_PREFIX}${this.nextId++}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(extra, { resolve: resolve as Pending["resolve"], reject });
      this.driver.send({ ...request, "@extra": extra }).catch((error: unknown) => {
        this.pending.delete(extra);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  close(): Promise<void> {
    return this.shutDown("close");
  }

  destroy(): Promise<void> {
    return this.shutDown("destroy");
  }

  private shutDown(how: "close" | "destroy"): Promise<void> {
    if (this.state === "open") {
      this.state = "closing";
      this.driver.send({ "@type": how }).catch(() => this.finishClose());
    }
    return this.closed;
  }

  private async receiveLoop(): Promise<void> {
    while (this.state !== "closed") {
      let responses: TdObject[];
      try {
        responses = await this.driver.receive();
      } catch {
        const unexpected = this.state === "open";
        await this.finishClose();
        if (unexpected) for (const listener of this.lostListeners) listener();
        break;
      }
      for (const response of responses) {
        this.dispatch(response);
        if (isClosedState(response)) {
          await this.finishClose();
          return;
        }
      }
    }
  }

  /** Only after `authorizationStateClosed`: the receive loop is its sole caller, so no receive is in flight. */
  private async finishClose(): Promise<void> {
    if (this.state === "closed") return;
    this.state = "closed";
    if (active === this) active = null;
    try {
      await this.driver.destroy();
    } catch {}
    for (const { reject } of this.pending.values()) reject(new Error("TDLib client is closed"));
    this.pending.clear();
    this.resolveClosed?.();
  }

  private dispatch(response: TdObject): void {
    const extra = response["@extra"];
    if (typeof extra === "string") {
      const pending = this.pending.get(extra);
      this.pending.delete(extra);
      if (!pending) return;
      if (response["@type"] === "error") {
        const { code, message } = response as TdError;
        pending.reject(new TdRequestError(code, message));
      } else {
        pending.resolve(response);
      }
      return;
    }
    if (response["@type"].startsWith("update")) {
      for (const listener of this.listeners) listener(response);
    }
  }
}

function isClosedState(raw: TdObject): boolean {
  const update = raw as TdUpdate;
  return (
    update["@type"] === "updateAuthorizationState" && update.authorization_state["@type"] === "authorizationStateClosed"
  );
}
