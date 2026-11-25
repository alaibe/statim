import { type ChatPrefs, prefsFor } from "@/core/messaging/chat-prefs";
import { useChatStore } from "@/core/messaging/chat-store";
import type { Chat } from "@/core/messaging/types";
import { Menu, type MenuAnchor, toast } from "@/design";
import { protocolSubtitle } from "@/features/protocols/presentation";

import { setBlocked } from "./block";
import { ChatAvatar } from "./chat-avatar";
import { useChatPermissions } from "./use-chat-permissions";

export interface ChatMenuTarget {
  chat: Chat;
  anchor: MenuAnchor | null;
}

export function ChatMenu({
  target,
  onClose,
  titleOf,
  selfIdOf,
  onBlock,
}: {
  target: ChatMenuTarget;
  onClose: () => void;
  titleOf: (c: Chat) => string;
  selfIdOf: (c: Chat) => string;
  onBlock: (c: Chat) => void;
}) {
  const { chat, anchor } = target;
  const prefs = useChatStore((s) => prefsFor(s.chatPrefs, chat.id));
  const setChatPref = useChatStore((s) => s.setChatPref);
  const markUnread = useChatStore((s) => s.markUnread);
  const { block } = useChatPermissions(chat.id);
  const choose = (key: keyof ChatPrefs, done: string) => {
    const was = Boolean(prefs[key]);
    void setChatPref(chat.id, { [key]: !was });
    toast.success(done, { label: "Undo", run: () => void setChatPref(chat.id, { [key]: was }) });
  };
  return (
    <Menu
      visible
      anchor={anchor}
      onClose={onClose}
      title={titleOf(chat)}
      subtitle={protocolSubtitle(chat.protocol)}
      leading={<ChatAvatar chat={chat} selfId={selfIdOf(chat)} size={40} />}
      items={[
        {
          label: prefs.pinned ? "Unpin" : "Pin to top",
          icon: "pin",
          keys: ["p"],
          onPress: () => choose("pinned", prefs.pinned ? "Unpinned the chat" : "Pinned the chat"),
        },
        {
          label: prefs.muted ? "Unmute" : "Mute",
          icon: prefs.muted ? "volume-2" : "volume-x",
          keys: ["m"],
          onPress: () => choose("muted", prefs.muted ? "Unmuted the chat" : "Muted the chat"),
        },
        {
          label: prefs.archived ? "Move out of archive" : "Archive",
          icon: "archive",
          keys: ["e"],
          onPress: () => choose("archived", prefs.archived ? "Moved the chat out of the archive" : "Archived the chat"),
        },
        {
          label: "Mark as unread",
          icon: "mail-dot",
          onPress: () => void markUnread(chat.id),
        },
        ...(block
          ? [
              {
                label: chat.blocked ? "Unblock" : "Block…",
                icon: "ban" as const,
                danger: !chat.blocked,
                onPress: () => (chat.blocked ? void setBlocked(chat.id, false) : onBlock(chat)),
              },
            ]
          : []),
      ]}
    />
  );
}
