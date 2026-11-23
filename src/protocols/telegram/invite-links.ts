import type { TdObject } from "./api";

const INVITE_PREFIX = /^(?:https?:\/\/)?t\.me\/(?:\+|joinchat\/)/i;

export function isInviteLink(value: string): boolean {
  return INVITE_PREFIX.test(value.trim());
}

export function normalizeInviteLink(value: string): string {
  const link = value.trim();
  if (!INVITE_PREFIX.test(link) || !/^[A-Za-z0-9_-]+\/?$/.test(link.replace(INVITE_PREFIX, "")))
    throw new Error("Enter a Telegram invite link such as t.me/+code.");
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

/** The joined chat's id, or null while its administrators review the request. */
export async function joinedChatId(result: Promise<TdObject>): Promise<number | null> {
  const { "@type": type, chat_id } = await result;
  if (type === "chatJoinResultSuccess") return chat_id as number;
  if (type === "chatJoinResultRequestSent") return null;
  if (type === "chatJoinResultGuardBotApprovalRequired")
    throw new Error("This chat's guard bot has to approve you. Join it from Telegram's own app.");
  throw new Error("The chat declined the request to join.");
}
