import { type ProtocolConnection, useChatStore } from "@/core/messaging/chat-store";
import { type ProtocolId, protocolEntries } from "@/core/messaging/namespace";
import { networkLabel } from "@/features/protocols/presentation";

export interface ConnectionSegment {
  id: string;
  /** Sentence case and compact, as the status bar says it: "Connecting XMTP", "Fetching Matrix history". */
  label: string;
  /** `ERR` when a protocol or its history failed, `WARN` when only some history is missing. */
  tag?: "ERR" | "WARN";
  busy?: boolean;
  protocol?: ProtocolId;
}

export interface ConnectionSummary {
  /** True while anything connects or fetches history. */
  busy: boolean;
  /** The segments joined with " · ", for the phone header's subtitle; empty when all is quiet. */
  label: string;
  segments: ConnectionSegment[];
}

/** The live state of every protocol, for the phone header's subtitle and the desktop's status bar. */
export function summarizeConnections(protocols: Partial<Record<ProtocolId, ProtocolConnection>>): ConnectionSummary {
  const segments = protocolEntries(protocols).flatMap(([id, state]): ConnectionSegment[] => {
    const name = networkLabel(id);
    if (state.status === "error") return [{ id, label: name, tag: "ERR", protocol: id }];
    if (state.history.status === "fetching") {
      return [{ id, label: `Fetching ${name} history`, busy: true, protocol: id }];
    }
    if (state.status === "connecting") return [{ id, label: `Connecting ${name}`, busy: true, protocol: id }];
    if (state.history.status === "error") return [{ id, label: `${name} history`, tag: "ERR", protocol: id }];
    if (state.history.status === "partial") return [{ id, label: `${name} history`, tag: "WARN", protocol: id }];
    return [];
  });
  return {
    busy: segments.some((segment) => segment.busy),
    label: segments.map((segment) => (segment.tag ? `${segment.tag} ${segment.label}` : segment.label)).join(" · "),
    segments,
  };
}

export function useConnectionSummary(): ConnectionSummary {
  return summarizeConnections(useChatStore((s) => s.protocols));
}
