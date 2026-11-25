import { connectionFor, type ProtocolConnection } from "@/core/messaging/chat-store";
import { LOCAL_PROTOCOL, type ProtocolId } from "@/core/messaging/namespace";
import { BRIDGED_NETWORKS, isBridgedNetwork, type NetworkId } from "@/core/messaging/networks";
import type { ChatProtocolMeta } from "@/core/messaging/protocol";
import type { ProtocolDescriptor } from "@/core/messaging/registry";
import type { IconName, TagTone } from "@/design";
import { connectableProtocols, protocolById } from "@/protocols";

/** How safe a protocol is, as a status tag's tone: the word beside it says why. */
export function toneFor(meta: ChatProtocolMeta): TagTone {
  if (!meta.properties.endToEndEncrypted) return "err";
  if (meta.properties.groupModel === "enforced" && meta.properties.forwardSecrecy) return "ok";
  return "warn";
}

const ICON: Record<ProtocolId, { name: IconName }> = {
  xmtp: { name: "shield-check" },
  nostr: { name: "zap" },
  status: { name: "radio-tower" },
  telegram: { name: "send" },
  matrix: { name: "layout-grid" },
  local: { name: "smartphone" },
};

export function protocolIcon(protocol: ProtocolId): { name: IconName } {
  return ICON[protocol];
}

/** A protocol's state as a tag: a status word, or a category word when there is nothing to report. */
export function connectionBadge(
  descriptor: ProtocolDescriptor,
  connection: ProtocolConnection,
): { label: string; tone: TagTone; detail?: string } {
  if (!descriptor.connect) return { label: "Not available", tone: "category" };
  if (connection.login) return { label: "WARN", tone: "warn", detail: "Sign in to finish connecting" };

  switch (connection.status) {
    case "ready":
      return connection.history.status === "partial"
        ? { label: "WARN", tone: "warn", detail: "Connected, history incomplete" }
        : { label: "OK", tone: "ok" };
    case "connecting":
      return { label: "Syncing", tone: "accent" };
    case "error":
      return { label: "ERR", tone: "err" };
    default:
      return { label: "Not set up", tone: "category" };
  }
}

export function protocolsNeedAttention(protocols: Partial<Record<ProtocolId, ProtocolConnection>>): boolean {
  return connectableProtocols().some((descriptor) => {
    const { tone } = connectionBadge(descriptor, connectionFor(protocols, descriptor.id));
    return tone === "warn" || tone === "err";
  });
}

export function protocolSubtitle(protocol: ProtocolId): string {
  if (protocol === LOCAL_PROTOCOL) return "On this device only";

  const descriptor = protocolById(protocol);
  if (!descriptor) return "Unknown protocol";

  const { properties } = descriptor.meta;
  if (!properties.endToEndEncrypted) return `${descriptor.label} · not end-to-end encrypted`;
  return `${descriptor.label} · end-to-end encrypted`;
}

export function describeProtocol(meta: ChatProtocolMeta): string {
  const { properties } = meta;
  const traits = [
    properties.endToEndEncrypted ? "end-to-end encrypted" : "NOT end-to-end encrypted",
    properties.forwardSecrecy ? "forward secrecy" : "no forward secrecy",
    `${properties.metadataPrivacy} metadata privacy`,
    GROUP_MODEL[properties.groupModel],
    properties.maxGroupSize === "unbounded" ? "unlimited group size" : `groups up to ${properties.maxGroupSize}`,
    properties.durableHistory ? "history restores on a new device" : "history stays on this device",
  ];
  return traits.join(" · ");
}

const GROUP_MODEL: Record<ChatProtocolMeta["properties"]["groupModel"], string> = {
  enforced: "enforced membership",
  "participant-set": "membership is just who you address",
};

export function networkLabel(network: NetworkId): string {
  if (isBridgedNetwork(network)) return BRIDGED_NETWORKS[network];
  return protocolById(network)?.label ?? network;
}
