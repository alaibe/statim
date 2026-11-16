import type { LinkState } from "./protocol";
import type { Unsubscribe } from "./types";

export class LinkTracker {
  private state: LinkState = "online";
  private readonly listeners = new Set<(link: LinkState) => void>();

  get current(): LinkState {
    return this.state;
  }

  subscribe(listener: (link: LinkState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  set(link: LinkState): void {
    if (link === this.state) return;
    this.state = link;
    for (const listener of this.listeners) listener(link);
  }
}
