import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { ChatPrefs } from '@/core/messaging/chat-prefs';
import { useChatStore } from '@/core/messaging/chat-store';
import { type Folder, type ChatListRow, isOwnFolder } from '@/core/messaging/folders';
import { formatTimestamp, messagePreview } from '@/core/messaging/preview';
import type { NetworkId } from '@/core/messaging/networks';
import type { Chat, ChatId } from '@/core/messaging/types';
import { readByPeer, unreadBadge } from '@/core/messaging/unread';
import {
  Chevron,
  CountBadge,
  Enter,
  Icon,
  ListItem,
  NetworkMark,
  type MenuAnchor,
  squareCorner,
  Pressable,
  SwipeableRow,
  Text,
} from '@/design';
import { openChat } from '@/features/navigation/open';
import { networkLabel } from '@/features/protocols/presentation';
import { ChatAvatar } from './chat-avatar';
import { DeliveryIcon, useReadUpTo } from './delivery-icon';

export function ChatRow({
  chat,
  title,
  selfId,
  unread,
  network,
  prefs,
  selected = false,
  onMenu,
  onToggle,
}: {
  chat: Chat;
  title: string;
  selfId: string;
  unread: boolean;
  network?: NetworkId;
  prefs: Readonly<ChatPrefs>;
  selected?: boolean;
  onMenu: (chat: Chat, anchor: MenuAnchor | null) => void;
  onToggle: (id: ChatId, key: keyof ChatPrefs) => void;
}) {
  const last = chat.lastMessage;
  const preview = messagePreview(last);
  const pinned = Boolean(prefs.pinned);
  const muted = Boolean(prefs.muted);
  const loaded = useChatStore((s) => s.messages[chat.id]);
  const since = useChatStore((s) => s.readAt[chat.id] ?? 0);
  const readUpTo = useReadUpTo(chat);

  return (
    <SwipeableRow
      left={[
        {
          id: 'pin',
          label: pinned ? 'Unpin' : 'Pin',
          icon: 'pin-outline',
          tone: 'neutral',
          onPress: () => onToggle(chat.id, 'pinned'),
        },
      ]}
      right={[
        {
          id: 'mute',
          label: muted ? 'Unmute' : 'Mute',
          icon: muted ? 'volume-high-outline' : 'volume-mute-outline',
          tone: 'warning',
          onPress: () => onToggle(chat.id, 'muted'),
        },
        {
          id: 'archive',
          label: prefs.archived ? 'Unarchive' : 'Archive',
          icon: 'archive-outline',
          tone: 'brand',
          onPress: () => onToggle(chat.id, 'archived'),
        },
      ]}>
      <ListItem
        testID={`chat-${chat.id}`}
        title={
          <>
            {title}
            {muted ? (
              <>
                {' '}
                <Icon name="volume-mute-outline" size={13} tone="subtle" />
              </>
            ) : null}
          </>
        }
        accessibilityLabel={[title, chat.typing ? 'typing' : preview].filter(Boolean).join(', ')}
        subtitle={chat.typing ? 'typing…' : preview}
        onPress={() => openChat(chat.id)}
        onLongPress={() => onMenu(chat, null)}
        onContextMenu={(anchor) => onMenu(chat, anchor)}
        selected={selected}
        unread={unread && !muted}
        leading={<ChatAvatar chat={chat} selfId={selfId} size="md" network={network} />}
        meta={
          last ? (
            <View className="flex-row items-center gap-1">
              {last.fromMe ? (
                <DeliveryIcon message={last} read={readByPeer(readUpTo, last)} size={14} />
              ) : null}
              <Text variant="caption" className={unread && !muted ? 'text-brand' : undefined}>
                {formatTimestamp(last.sentAt)}
              </Text>
            </View>
          ) : undefined
        }
        subtitleTrailing={
          unread ? (
            <CountBadge count={unreadBadge(chat, since, loaded)} muted={muted} />
          ) : pinned ? (
            <Icon name="pin" size={14} tone="subtle" />
          ) : undefined
        }
      />
    </SwipeableRow>
  );
}

const chatCount = (n: number) => `${n} ${n === 1 ? 'chat' : 'chats'}`;

const OWN_FOLDERS = {
  archive: { label: 'Archive', icon: 'archive-outline' },
  blocked: { label: 'Blocked', icon: 'ban-outline' },
} as const;

export function folderLabel(folder: Folder): string {
  return isOwnFolder(folder) ? OWN_FOLDERS[folder].label : networkLabel(folder);
}

export const leaveFolderLabel = (folder: Folder) => `Back to all chats from ${folderLabel(folder)}`;

export const chatSearchPlaceholder = (folder: Folder | null) =>
  folder ? `Search ${folderLabel(folder)}` : 'Search chats';

function FolderIcon({ folder, size }: { folder: Folder; size: number }) {
  if (!isOwnFolder(folder)) {
    return <NetworkMark network={folder} label={folderLabel(folder)} size={size} square />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: squareCorner(size),
        borderCurve: 'continuous',
      }}
      className="items-center justify-center bg-surface-sunken">
      <Icon name={OWN_FOLDERS[folder].icon} size={size * 0.5} tone="muted" />
    </View>
  );
}

export function FolderRow({
  row,
  unread,
  preview,
  onPress,
}: {
  row: Extract<ChatListRow, { kind: 'folder' }>;
  unread: number;
  preview: string;
  onPress: () => void;
}) {
  const quiet = isOwnFolder(row.folder);
  const highlight = unread > 0 && !quiet;
  return (
    <ListItem
      testID={`folder-${row.folder}`}
      title={folderLabel(row.folder)}
      subtitle={preview}
      accessibilityLabel={`${folderLabel(row.folder)}, ${chatCount(row.chats.length)}${unread ? `, ${unread} unread` : ''}`}
      onPress={onPress}
      unread={highlight}
      leading={<FolderIcon folder={row.folder} size={44} />}
      meta={
        row.latest.lastMessage ? (
          <Text variant="caption" className={highlight ? 'text-brand' : undefined}>
            {formatTimestamp(row.latest.lastMessage.sentAt)}
          </Text>
        ) : undefined
      }
      subtitleTrailing={unread > 0 ? <CountBadge count={unread} muted={quiet} /> : undefined}
      trailing={<Chevron />}
    />
  );
}

export function FolderHeader({ folder, onBack }: { folder: Folder; onBack: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={leaveFolderLabel(folder)}
      onPress={onBack}
      className="min-w-0 flex-1 flex-row items-center gap-1.5">
      <Icon name="chevron-back" size={20} tone="brand" />
      <FolderIcon folder={folder} size={22} />
      <Text variant="title" className="flex-1 font-semibold" numberOfLines={1}>
        {folderLabel(folder)}
      </Text>
    </Pressable>
  );
}

export function Separator() {
  return <View className="ml-[76px] mr-3 h-px bg-line" />;
}

export function ConnectingState() {
  return (
    <Animated.View entering={Enter.fade()} className="gap-1 px-gutter pt-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} className="min-h-tap flex-row items-center gap-3 py-2.5">
          <View className="h-11 w-11 rounded-pill bg-surface-sunken" />
          <View className="flex-1 gap-2">
            <View className="h-3 w-1/3 rounded-pill bg-surface-sunken" />
            <View className="h-2.5 w-2/3 rounded-pill bg-surface-sunken" />
          </View>
        </View>
      ))}
      <Text variant="caption" className="mt-3 text-center">
        Fetching history…
      </Text>
    </Animated.View>
  );
}
