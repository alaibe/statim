import { ActionSheet, type MenuAnchor } from '@/design';
import type { ChatPrefs } from '@/core/messaging/chat-prefs';
import { useChatStore } from '@/core/messaging/chat-store';
import type { Chat } from '@/core/messaging/types';
import { protocolSubtitle } from '@/features/protocols/presentation';

import { ChatAvatar } from './chat-avatar';

export interface ChatMenuTarget {
  chat: Chat;
  anchor: MenuAnchor | null;
}

export function ChatMenu({
  target,
  onClose,
  titleOf,
  selfIdOf,
}: {
  target: ChatMenuTarget | null;
  onClose: () => void;
  titleOf: (c: Chat) => string;
  selfIdOf: (c: Chat) => string;
}) {
  const chat = target?.chat;
  const prefs = useChatStore((s) => (chat ? s.chatPrefs[chat.id] : undefined));
  const setChatPref = useChatStore((s) => s.setChatPref);
  const markUnread = useChatStore((s) => s.markUnread);
  const choose = (key: keyof ChatPrefs) => {
    if (chat) void setChatPref(chat.id, { [key]: !prefs?.[key] });
  };

  return (
    <ActionSheet
      visible={target !== null}
      anchor={target?.anchor}
      onClose={onClose}
      title={chat ? titleOf(chat) : undefined}
      subtitle={chat ? protocolSubtitle(chat.protocol) : undefined}
      leading={chat ? <ChatAvatar chat={chat} selfId={selfIdOf(chat)} size="md" /> : undefined}
      actions={[
        {
          label: prefs?.pinned ? 'Unpin' : 'Pin to top',
          icon: 'pin-outline',
          onPress: () => choose('pinned'),
        },
        {
          label: prefs?.muted ? 'Unmute' : 'Mute',
          icon: prefs?.muted ? 'volume-high-outline' : 'volume-mute-outline',
          onPress: () => choose('muted'),
        },
        {
          label: prefs?.archived ? 'Move out of archive' : 'Archive',
          icon: 'archive-outline',
          onPress: () => choose('archived'),
        },
        {
          label: 'Mark as unread',
          icon: 'mail-unread-outline',
          onPress: () => {
            if (chat) void markUnread(chat.id);
          },
        },
      ]}
    />
  );
}
