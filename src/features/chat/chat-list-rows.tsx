import { View } from "react-native";

import type { AiConfig } from "@/core/ai/config";
import type { ChatPrefs } from "@/core/messaging/chat-prefs";
import { useChatStore } from "@/core/messaging/chat-store";
import { type ChatListRow, type Folder, isOwnFolder } from "@/core/messaging/folders";
import type { NetworkId } from "@/core/messaging/networks";
import { messagePreview } from "@/core/messaging/preview";
import type { Chat, ChatId } from "@/core/messaging/types";
import { readByPeer, unreadBadge } from "@/core/messaging/unread";
import {
  Avatar,
  Icon,
  type MenuAnchor,
  NetworkMark,
  Pressable,
  Row,
  Skeleton,
  SwipeableRow,
  Tag,
  Text,
} from "@/design";
import { openChat } from "@/features/navigation/open";
import { networkLabel } from "@/features/protocols/presentation";
import { ChatAvatar } from "./chat-avatar";
import { DeliveryIcon, useReadUpTo } from "./delivery-icon";
import { formatListTime } from "./list-time";
import { useChatAttention } from "./use-chat-attention";

/** What the assistant thinks a chat needs, as a tag word: never a colour alone. */
const ATTENTION = {
  reply: { label: "Reply", tone: "accent" },
  "follow-up": { label: "Follow up", tone: "warn" },
} as const;

/** A count in a list is plain mono text, in `accent` when it is unread news. */
function Count({ count, lit }: { count: number; lit: boolean }) {
  return (
    <Text variant="meta" tone={lit ? "accent" : "muted"}>
      {count > 99 ? "99+" : count}
    </Text>
  );
}

export function ChatRow({
  chat,
  aiConfig,
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
  aiConfig?: AiConfig;
  title: string;
  selfId: string;
  unread: boolean;
  network?: NetworkId;
  prefs: Readonly<ChatPrefs>;
  selected?: boolean;
  onMenu: (chat: Chat, anchor: MenuAnchor | null) => void;
  onToggle: (id: ChatId, key: keyof ChatPrefs) => void;
}) {
  const attentionKind = useChatAttention(chat, aiConfig);
  const attention = attentionKind ? ATTENTION[attentionKind] : null;
  const last = chat.lastMessage;
  const preview = messagePreview(last);
  const pinned = Boolean(prefs.pinned);
  const muted = Boolean(prefs.muted);
  const loaded = useChatStore((s) => s.messages[chat.id]);
  const since = useChatStore((s) => s.readAt[chat.id] ?? 0);
  const readUpTo = useReadUpTo(chat);
  const lit = unread && !muted;

  return (
    <SwipeableRow
      left={[
        {
          id: "pin",
          label: pinned ? "Unpin" : "Pin",
          icon: "pin",
          onPress: () => onToggle(chat.id, "pinned"),
        },
      ]}
      right={[
        {
          id: "mute",
          label: muted ? "Unmute" : "Mute",
          icon: muted ? "volume-2" : "volume-x",
          onPress: () => onToggle(chat.id, "muted"),
        },
        {
          id: "archive",
          label: prefs.archived ? "Unarchive" : "Archive",
          icon: "archive",
          onPress: () => onToggle(chat.id, "archived"),
        },
      ]}
    >
      <Row
        testID={`chat-${chat.id}`}
        title={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text numberOfLines={1} strong={lit} style={{ flexShrink: 1 }}>
              {title}
            </Text>
            {muted ? <Icon name="volume-x" size={16} tone="muted" /> : null}
            {pinned ? <Icon name="pin" size={16} tone="muted" /> : null}
          </View>
        }
        accessibilityLabel={[title, lit ? "unread" : null, attention?.label, chat.typing ? "typing" : preview]
          .filter(Boolean)
          .join(", ")}
        preview={chat.typing ? "typing…" : preview}
        onPress={() => openChat(chat.id)}
        onLongPress={() => onMenu(chat, null)}
        onContextMenu={(anchor) => onMenu(chat, anchor)}
        selected={selected}
        unread={lit}
        leading={<ChatAvatar chat={chat} selfId={selfId} network={network} />}
        meta={
          last ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {last.fromMe ? <DeliveryIcon message={last} read={readByPeer(readUpTo, last)} size={16} /> : null}
              <Text variant="meta" tone={lit ? "accent" : "muted"}>
                {formatListTime(last.sentAt)}
              </Text>
            </View>
          ) : undefined
        }
        tags={
          attention || unread ? (
            <>
              {attention ? <Tag tone={attention.tone} label={attention.label} /> : null}
              {unread ? <Count count={unreadBadge(chat, since, loaded)} lit={lit} /> : null}
            </>
          ) : undefined
        }
      />
    </SwipeableRow>
  );
}

const chatCount = (n: number) => `${n} ${n === 1 ? "chat" : "chats"}`;

const OWN_FOLDERS = {
  archive: { label: "Archive", icon: "archive" },
  blocked: { label: "Blocked", icon: "ban" },
} as const;

export function folderLabel(folder: Folder): string {
  return isOwnFolder(folder) ? OWN_FOLDERS[folder].label : networkLabel(folder);
}

export const leaveFolderLabel = (folder: Folder) => `Back to all chats from ${folderLabel(folder)}`;

export const chatSearchPlaceholder = (folder: Folder | null) =>
  folder ? `Search ${folderLabel(folder)}` : "Search chats";

/** A folder is a place, so it takes a square: Statim's own as a Lucide icon, a network as its mark. */
function FolderIcon({ folder, size }: { folder: Folder; size: 20 | 40 }) {
  if (!isOwnFolder(folder)) {
    return <NetworkMark network={folder} label={folderLabel(folder)} size={size} square />;
  }
  return <Avatar size={size} shape="square" icon={OWN_FOLDERS[folder].icon} label={folderLabel(folder)} />;
}

export function FolderRow({
  row,
  unread,
  preview,
  onPress,
}: {
  row: Extract<ChatListRow, { kind: "folder" }>;
  unread: number;
  preview: string;
  onPress: () => void;
}) {
  const quiet = isOwnFolder(row.folder);
  const highlight = unread > 0 && !quiet;
  return (
    <Row
      testID={`folder-${row.folder}`}
      title={folderLabel(row.folder)}
      preview={preview}
      accessibilityLabel={`${folderLabel(row.folder)}, ${chatCount(row.chats.length)}${unread ? `, ${unread} unread` : ""}`}
      onPress={onPress}
      unread={highlight}
      leading={<FolderIcon folder={row.folder} size={40} />}
      meta={
        row.latest.lastMessage ? (
          <Text variant="meta" tone={highlight ? "accent" : "muted"}>
            {formatListTime(row.latest.lastMessage.sentAt)}
          </Text>
        ) : undefined
      }
      tags={unread > 0 ? <Count count={unread} lit={highlight} /> : undefined}
      trailing={<Icon name="chevron-right" size={16} tone="muted" />}
    />
  );
}

/** The open folder's name with the way back to every chat. */
export function FolderHeader({ folder, onBack }: { folder: Folder; onBack: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={leaveFolderLabel(folder)}
      onPress={onBack}
      className="min-w-0 flex-1 flex-row items-center gap-2"
    >
      <Icon name="chevron-left" size={20} tone="muted" />
      <FolderIcon folder={folder} size={20} />
      <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
        {folderLabel(folder)}
      </Text>
    </Pressable>
  );
}

/** While the first chats arrive: rows in their shape, in `hover`; the status says what is running. */
export function ConnectingState() {
  return <Skeleton rows={6} avatar />;
}
