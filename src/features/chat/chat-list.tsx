import { useRouter } from 'expo-router';
import { useObserve } from 'expo-observe';
import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { RefreshControl, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  CountBadge,
  EmptyState,
  Enter,
  Icon,
  type MenuAnchor,
  Pressable,
  Text,
  useEscapeKey,
  useThemeColors,
} from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import type { Conversation } from '@/core/messaging/types';
import { messagePreview } from '@/core/messaging/preview';
import { type ChatPrefs } from '@/core/messaging/chat-prefs';
import { type Directory, type InboxRow, isUnreadHere, networkOf } from '@/core/messaging/folders';
import { isUnread } from '@/core/messaging/unread';
import { useConversationTitles } from '@/features/chat/use-display-names';
import { HistoryStatus } from '@/features/chat/history-status';
import { FilterTabs } from '@/features/chat/folder-tabs';
import { useFolderStore } from '@/features/chat/folder-store';
import { useUnreadCounts } from '@/features/chat/use-unread-counts';
import { ChatMenu, type ChatMenuTarget } from './chat-menu';
import {
  ConnectingState,
  ConversationRow,
  DirectoryHeader,
  DirectoryRow,
  Separator,
} from './chat-list-rows';
import { inbox, isFolded } from './inbox';

const NO_IDS: ReadonlySet<string> = new Set();

export interface ChatListProps {
  query: string;
  /** The conversation open beside the list, on layouts that show both. */
  selectedId?: string;
}

/** The conversation list: the Chats tab on a phone, the sidebar on desktop. */
export function ChatList({ query, selectedId }: ChatListProps) {
  const router = useRouter();
  const colors = useThemeColors();

  const baseConversations = useChatStore((s) => s.conversations);
  const status = useChatStore((s) => s.status);

  const { markInteractive } = useObserve();
  useEffect(() => {
    if (baseConversations.length > 0 || status === 'ready' || status === 'error') {
      markInteractive();
    }
  }, [baseConversations.length, status, markInteractive]);
  const syncing = useChatStore((s) => s.syncing);
  const fetchingHistory = useChatStore((s) =>
    Object.values(s.protocols).some(
      (p) => p.status === 'connecting' || p.history?.status === 'fetching'
    )
  );
  const sync = useChatStore((s) => s.sync);
  const readAt = useChatStore((s) => s.readAt);
  const conversations = useUnreadCounts(baseConversations);

  const { selfIdOf, titleOf } = useConversationTitles(conversations);
  const chatPrefs = useChatStore((s) => s.chatPrefs);
  const setChatPref = useChatStore((s) => s.setChatPref);
  const toggle = (id: string, key: keyof ChatPrefs) =>
    setChatPref(id, { [key]: !useChatStore.getState().chatPrefs[id]?.[key] });

  const [menu, setMenu] = useState<ChatMenuTarget | null>(null);
  const showMenu = (conversation: Conversation, anchor: MenuAnchor | null) =>
    setMenu({ conversation, anchor });
  const directory = useFolderStore((s) => s.directory);
  const setDirectory = useFolderStore((s) => s.setDirectory);
  const filter = useFolderStore((s) => s.filter);
  const setFilter = useFolderStore((s) => s.setFilter);
  const [navigated, setNavigated] = useState(false);

  // A chat read under Unread stays until the view changes, rather than vanishing under the pointer.
  const view = `${directory}|${filter}`;
  const [kept, setKept] = useState({ view, ids: NO_IDS });
  const held = kept.view === view ? kept.ids : NO_IDS;
  const deferredQuery = useDeferredValue(query);
  const { allowed, requests, scope, rows, unseen, unreadHere, mentionsHere, showNetwork } = useMemo(
    () =>
      inbox({
        conversations,
        chatPrefs,
        readAt,
        directory,
        filter,
        query: deferredQuery,
        held,
        titleOf,
      }),
    [conversations, chatPrefs, readAt, directory, filter, deferredQuery, held, titleOf]
  );
  if (unseen.length > 0) setKept({ view, ids: new Set([...held, ...unseen]) });

  const trimmed = query.trim();
  const list = useRef<FlashListRef<InboxRow>>(null);
  const selectedIndex = rows.findIndex(
    (row) => row.kind === 'chat' && row.conversation.id === selectedId
  );
  const selectedListed = selectedIndex >= 0;
  const revealSelected = useEffectEvent(() => {
    const view = list.current;
    if (!view || selectedIndex < 0) return;
    const { startIndex, endIndex } = view.computeVisibleIndices();
    if (selectedIndex > startIndex && selectedIndex < endIndex) return;
    void view.scrollToIndex({ index: selectedIndex, animated: true, viewPosition: 0.5 });
  });
  // Only when the selection changes: a selected chat that moves on a new message stays put.
  useEffect(() => {
    if (selectedListed) revealSelected();
  }, [selectedId, selectedListed]);
  const go = (next: Directory | null) => {
    setNavigated(true);
    setDirectory(next);
  };
  const leaveDirectory = () => go(null);
  useEscapeKey(directory !== null, leaveDirectory);
  const openSelectedDirectory = useEffectEvent(() => {
    const selected = allowed.find((c) => c.id === selectedId);
    if (!selected || selectedListed || trimmed) return;
    const network = networkOf(selected);
    const home: Directory | null = chatPrefs[selected.id]?.archived
      ? 'archive'
      : network && isFolded(network) && !chatPrefs[selected.id]?.pinned
        ? `network:${network}`
        : null;
    if (home !== directory) setDirectory(home);
  });
  useEffect(() => {
    openSelectedDirectory();
  }, [selectedId]);

  const folderContext = { prefs: chatPrefs, readAt };
  const renderItem = ({ item: row }: ListRenderItemInfo<InboxRow>) =>
    row.kind === 'directory' ? (
      <DirectoryRow
        row={row}
        unread={row.chats.filter((c) => isUnreadHere(c, folderContext)).length}
        preview={`${titleOf(row.latest)}: ${messagePreview(row.latest.lastMessage)}`}
        onPress={() => go(row.directory)}
      />
    ) : (
      <ConversationRow
        conversation={row.conversation}
        title={titleOf(row.conversation)}
        selfId={selfIdOf(row.conversation)}
        unread={isUnread(row.conversation, readAt)}
        network={showNetwork ? networkOf(row.conversation) : undefined}
        prefs={chatPrefs[row.conversation.id]}
        selected={row.conversation.id === selectedId}
        onMenu={showMenu}
        onToggle={toggle}
      />
    );

  return (
    <>
      {conversations.length > 0 ? (
        <FilterTabs
          active={filter}
          onSelect={setFilter}
          unread={unreadHere}
          mentions={mentionsHere}
        />
      ) : null}
      {directory ? (
        <DirectoryHeader directory={directory} onBack={leaveDirectory} count={scope.length} />
      ) : null}
      <HistoryStatus compact />
      {(status === 'connecting' || fetchingHistory) && conversations.length === 0 ? (
        <ConnectingState />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No conversations yet"
          description="Start one with an Ethereum address on XMTP, or a public key on Nostr or Waku."
          actionLabel="New conversation"
          onAction={() => router.push('/new-chat')}
        />
      ) : (
        <Animated.View
          key={directory ?? 'inbox'}
          entering={navigated ? (directory ? Enter.fromRight() : Enter.fromLeft()) : undefined}
          className="flex-1">
          <FlashList
            ref={list}
            data={rows}
            keyExtractor={(row) => (row.kind === 'chat' ? row.conversation.id : row.directory)}
            getItemType={(row) => row.kind}
            ItemSeparatorComponent={Separator}
            contentInsetAdjustmentBehavior="automatic"
            ListEmptyComponent={
              <EmptyState
                icon="search-outline"
                title={
                  trimmed
                    ? 'No matching chats'
                    : filter === 'unread'
                      ? 'All caught up'
                      : 'Nothing here'
                }
                description={
                  trimmed
                    ? `No chats match “${trimmed}”.`
                    : filter === 'unread'
                      ? 'Nothing unread here.'
                      : 'Try another filter.'
                }
              />
            }
            refreshControl={
              <RefreshControl refreshing={syncing} onRefresh={sync} tintColor={colors.brand} />
            }
            ListHeaderComponent={
              <>
                {requests.length > 0 && !directory ? (
                  <Pressable
                    testID="open-requests"
                    accessibilityRole="button"
                    onPress={() => router.push('/requests')}
                    className="mx-gutter mb-2 min-h-tap flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-3">
                    <Icon name="mail-unread-outline" size={20} tone="brand" />
                    <View className="min-w-0 flex-1">
                      <Text className="font-semibold">Message requests</Text>
                      <Text variant="caption">From people you haven’t replied to</Text>
                    </View>
                    <CountBadge count={requests.length} />
                  </Pressable>
                ) : null}
              </>
            }
            renderItem={renderItem}
          />
        </Animated.View>
      )}

      <ChatMenu target={menu} onClose={() => setMenu(null)} titleOf={titleOf} selfIdOf={selfIdOf} />
    </>
  );
}
