import type { ParticipantId } from "./types";

const SCHEME = "mention:";

/** Stored as `[Name](mention:<participant id>)`; each protocol turns it into its own form and back. */
export function mentionLink(name: string, id: ParticipantId): string {
  return `[${name.replace(/[[\]\\]/g, "\\$&")}](${mentionHref(id)})`;
}

export function mentionHref(id: ParticipantId): string {
  return `${SCHEME}${encodeURIComponent(id)}`;
}

export function mentionIdOf(href: string): ParticipantId | null {
  return href.startsWith(SCHEME) ? decodeId(href.slice(SCHEME.length)) : null;
}

export function decodeId(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded) || null;
  } catch {
    return null;
  }
}
