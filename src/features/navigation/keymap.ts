import type { ChatId } from "@/core/messaging/types";

/** Phones have no keys; the desktop's keymap is keymap.web.ts. */
export function useKeymap(_segments: readonly string[], _chatId: ChatId | undefined): void {}
