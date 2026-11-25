import { useGlobalSearchParams, useSegments } from "expo-router";
import { useState } from "react";

import { orderChats } from "@/core/messaging/chat-prefs";
import { useChatStore } from "@/core/messaging/chat-store";
import { isUnreadHere, splitRequests } from "@/core/messaging/folders";
import { parseChatId } from "@/core/messaging/namespace";
import type { Chat } from "@/core/messaging/types";
import { CommandPalette, desktop, type PaletteEntry, type PaletteGroup } from "@/design";
import { ChatAvatar } from "@/features/chat/chat-avatar";
import { useChatTitles } from "@/features/chat/use-display-names";

import { COMMANDS, type CommandScope, useOverlays } from "./commands";
import { openChat } from "./open";

const RECENT = 6;

/** Keys that only move or close have no name worth finding; the window's own commands need a window. */
const UNLISTED = new Set(["new", "search", "next-arrow", "previous-arrow", "close-chat", "undo", "palette"]);

/** The palette is the overlay store's: ⌘K, the app menu, and the phone's search field open it. */
export function Palette() {
  const open = useOverlays((s) => s.palette);
  return open ? <PalettePanel /> : null;
}

function PalettePanel() {
  const segments = useSegments() as string[];
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const scope: CommandScope = {
    segments,
    chatId: segments[0] === "chat" && id ? (parseChatId(id) ?? undefined) : undefined,
  };
  const close = () => useOverlays.getState().set({ palette: false });
  const [query, setQuery] = useState("");

  const chats = useChatStore((s) => s.chats);
  const chatPrefs = useChatStore((s) => s.chatPrefs);
  const readAt = useChatStore((s) => s.readAt);
  const { selfIdOf, titleOf } = useChatTitles(chats);

  const groups = ((): PaletteGroup[] => {
    const ordered = orderChats(splitRequests(chats).accepted, chatPrefs);
    const unread = ordered.filter((chat) => isUnreadHere(chat, { prefs: chatPrefs, readAt }));
    const item = (chat: Chat): PaletteEntry => ({
      id: `chat:${chat.id}`,
      label: titleOf(chat),
      kind: "item",
      leading: <ChatAvatar chat={chat} selfId={selfIdOf(chat)} size={20} />,
      run: () => openChat(chat.id),
    });
    const searching = query.replace(/^[>#]/, "").trim().length > 0;
    const listed = searching
      ? ordered
      : [...unread, ...ordered.filter((chat) => !unread.includes(chat)).slice(0, RECENT)];
    const commands = COMMANDS.filter(
      (command) =>
        !UNLISTED.has(command.id) &&
        !command.sequence &&
        !(command.keys?.length === 1 && /^[a-z]$/.test(command.keys[0]) && command.group === "Chat" && !command.icon) &&
        (desktop || command.group !== "Window") &&
        (!command.when || command.when(scope)),
    );
    const entry = (command: (typeof commands)[number]): PaletteEntry => ({
      id: command.id,
      label: command.label,
      kind: command.group === "Go to" ? "place" : "action",
      icon: command.icon,
      keys: command.keys,
      sequence: command.sequence,
      run: () => command.run(scope),
    });
    return [
      { label: searching ? "Chats" : unread.length ? "Unread and recent" : "Recent", entries: listed.map(item) },
      {
        label: "Actions",
        entries: commands.filter((c) => c.group !== "Go to" && c.icon).map(entry),
      },
      { label: "Go to", entries: commands.filter((c) => c.group === "Go to").map(entry) },
    ];
  })();

  return <CommandPalette visible onClose={close} groups={groups} query={query} onQuery={setQuery} />;
}
