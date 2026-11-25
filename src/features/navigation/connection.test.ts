import { NO_CONNECTION, type ProtocolConnection } from "@/core/messaging/chat-store";

import { summarizeConnections } from "./connection";

const state = (patch: Partial<ProtocolConnection>): ProtocolConnection => ({ ...NO_CONNECTION, ...patch });

describe("summarizeConnections", () => {
  it("is quiet when everything is ready", () => {
    expect(summarizeConnections({ xmtp: state({ status: "ready" }) })).toEqual({
      busy: false,
      label: "",
      segments: [],
    });
  });

  it("says what is running", () => {
    const summary = summarizeConnections({
      xmtp: state({ status: "connecting" }),
      matrix: state({ status: "ready", history: { status: "fetching" } }),
    });
    expect(summary.busy).toBe(true);
    expect(summary.segments.every((segment) => segment.busy)).toBe(true);
    expect(summary.label).toContain(" · ");
  });

  it("tags failures, so status is never colour alone", () => {
    const summary = summarizeConnections({
      telegram: state({ status: "error" }),
      nostr: state({ status: "ready", history: { status: "partial" } }),
    });
    expect(summary.busy).toBe(false);
    expect(summary.segments.map((segment) => [segment.protocol, segment.tag])).toEqual([
      ["telegram", "ERR"],
      ["nostr", "WARN"],
    ]);
  });
});
