import { ActionSheet, type MenuAnchor } from '@/design';
import type { ChatPrefs } from '@/core/messaging/chat-prefs';
import { useChatStore } from '@/core/messaging/chat-store';
import type { Conversation } from '@/core/messaging/types';
import { protocolSubtitle } from '@/features/protocols/presentation';

import { ConversationAvatar } from './conversation-avatar';

export interface ChatMenuTarget {
  conversation: Conversation;
  anchor: MenuAnchor | null;
}

/** Pin, mute, archive and mark unread, for a chat held or right-clicked in the list. */
export function ChatMenu({
  target,
  onClose,
  titleOf,
  selfIdOf,
  onToggle,
}: {
  target: ChatMenuTarget | null;
  onClose: () => void;
  titleOf: (c: Conversation) => string;
  selfIdOf: (c: Conversation) => string;
  onToggle: (id: string, key: keyof ChatPrefs) => void;
}) {
  const conversation = target?.conversation;
  const prefs = useChatStore((s) => (conversation ? s.chatPrefs[conversation.id] : undefined));
  const markUnread = useChatStore((s) => s.markUnread);
  const choose = (key: keyof ChatPrefs) => {
    if (conversation) onToggle(conversation.id, key);
  };

  return (
    <ActionSheet
      visible={target !== null}
      anchor={target?.anchor}
      onClose={onClose}
      title={conversation ? titleOf(conversation) : undefined}
      subtitle={conversation ? protocolSubtitle(conversation.protocol) : undefined}
      leading={
        conversation ? (
          <ConversationAvatar
            conversation={conversation}
            selfId={selfIdOf(conversation)}
            size="md"
          />
        ) : undefined
      }
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
            if (conversation) void markUnread(conversation.id);
          },
        },
      ]}
    />
  );
}
