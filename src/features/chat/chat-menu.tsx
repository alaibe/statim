import { ActionSheet, type MenuAnchor, type SheetAction } from '@/design';
import { type ChatPrefs, prefsFor } from '@/core/messaging/chat-prefs';
import { useChatStore } from '@/core/messaging/chat-store';
import { chatPermissions } from '@/core/messaging/permissions';
import type { Chat } from '@/core/messaging/types';
import { protocolSubtitle } from '@/features/protocols/presentation';

import { setBlocked } from './block';
import { ChatAvatar } from './chat-avatar';
import { useSupports } from './use-supports';

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
  const { session } = useSupports(chat.id);
  const choose = (key: keyof ChatPrefs) => void setChatPref(chat.id, { [key]: !prefs[key] });
  const block: SheetAction[] = chatPermissions(chat, session).block
    ? [
        chat.blocked
          ? {
              label: 'Unblock',
              icon: 'ban-outline',
              onPress: () => void setBlocked(chat.id, false),
            }
          : { label: 'Block', icon: 'ban-outline', tone: 'danger', onPress: () => onBlock(chat) },
      ]
    : [];

  return (
    <ActionSheet
      visible
      anchor={anchor}
      onClose={onClose}
      title={titleOf(chat)}
      subtitle={protocolSubtitle(chat.protocol)}
      leading={<ChatAvatar chat={chat} selfId={selfIdOf(chat)} size="md" />}
      actions={[
        {
          label: prefs.pinned ? 'Unpin' : 'Pin to top',
          icon: 'pin-outline',
          onPress: () => choose('pinned'),
        },
        {
          label: prefs.muted ? 'Unmute' : 'Mute',
          icon: prefs.muted ? 'volume-high-outline' : 'volume-mute-outline',
          onPress: () => choose('muted'),
        },
        {
          label: prefs.archived ? 'Move out of archive' : 'Archive',
          icon: 'archive-outline',
          onPress: () => choose('archived'),
        },
        {
          label: 'Mark as unread',
          icon: 'mail-unread-outline',
          onPress: () => void markUnread(chat.id),
        },
        ...block,
      ]}
    />
  );
}
