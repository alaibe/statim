import type { TdMessage } from "./types";

const SEND_TIMEOUT_MS = 30_000;

interface Pending {
  resolve(message: TdMessage): void;
  reject(error: Error): void;
}

export class Outbox {
  private readonly pending = new Map<number, Pending>();

  /** Waiting for the real id turns a rejected send into a failed message; when slow, the placeholder will do. */
  await(sent: TdMessage): Promise<TdMessage> {
    if (!sent.sending_state) return Promise.resolve(sent);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(sent.id);
        resolve(sent);
      }, SEND_TIMEOUT_MS);
      this.pending.set(sent.id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  resolve(oldId: number, message: TdMessage): void {
    this.pending.get(oldId)?.resolve(message);
    this.pending.delete(oldId);
  }

  reject(oldId: number, error: Error): void {
    this.pending.get(oldId)?.reject(error);
    this.pending.delete(oldId);
  }

  rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
