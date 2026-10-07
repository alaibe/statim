import { useRouter } from 'expo-router';
import { useObserve } from 'expo-observe';
import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { RefreshControl, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  Chevron,
  CountBadge,
  EmptyState,
  Enter,
  Icon,
  ListItem,
  type MenuAnchor,
  Pressable,
  Text,
  useEscapeKey,
  useThemeColors,
} from '@/design';
import { reportError } from '@/core/app/report-error';
import { useChatStore } from '@/core/messaging/chat-store';
import type { Chat, ChatId } from '@/core/messaging/types';
import { messagePreview, nameList } from '@/core/messaging/preview';
import { type ChatPrefs, type ChatPrefsMap, prefsFor } from '@/core/messaging/chat-prefs';
import {
  type ChatFilter,
  type FilterContext,
  type Folder,
  type ChatListRow,
  folderProtocol,
  homeFolder,
  isUnreadHere,
  networkOf,
} from '@/core/messaging/folders';
import { isUnread } from '@/core/messaging/unread';
import { useChatTitles } from '@/features/chat/use-display-names';
import { HistoryStatus } from '@/features/chat/history-status';
import { FilterBar } from '@/features/chat/filter-bar';
import { useChatListStore } from '@/features/chat/chat-list-store';
import { useUnreadCounts } from '@/features/chat/use-unread-counts';
import { BlockSheet } from './block';
import { ChatMenu, type ChatMenuTarget } from './chat-menu';
import { ConnectingState, ChatRow, FolderRow, Separator } from './chat-list-rows';
import { chatListContents, isFolded } from './chat-list-contents';

const NO_IDS: ReadonlySet<string> = new Set();

interface ChatListProps {
  query: string;
  /** The chat open beside the list, on layouts that show both. */
  selectedId?: string;
}

/** The chat list: the Chats tab on a phone, the sidebar on desktop. */
export function ChatList({ query, selectedId }: ChatListProps) {
  const colors = useThemeColors();

  const baseChats = useChatStore((s) => s.chats);
  const status = useChatStore((s) => s.status);

  const { markInteractive } = useObserve();
  useEffect(() => {
    if (baseChats.length > 0 || status === 'ready' || status === 'error') {
      markInteractive();
    }
  }, [baseChats.length, status, markInteractive]);
  const syncing = useChatStore((s) => s.syncing);
  const sync = useChatStore((s) => s.sync);
  const readAt = useChatStore((s) => s.readAt);
  const chats = useUnreadCounts(baseChats);

  const { selfIdOf, titleOf } = useChatTitles(chats);
  const chatPrefs = useChatStore((s) => s.chatPrefs);
  const setChatPref = useChatStore((s) => s.setChatPref);
  const toggle = (id: ChatId, key: keyof ChatPrefs) => {
    setChatPref(id, { [key]: !prefsFor(useChatStore.getState().chatPrefs, id)[key] }).catch(
      reportError
    );
  };

  const [menu, setMenu] = useState<ChatMenuTarget | null>(null);
  const [blocking, setBlocking] = useState<Chat | null>(null);
  const showMenu = (chat: Chat, anchor: MenuAnchor | null) => setMenu({ chat, anchor });
  const folder = useChatListStore((s) => s.folder);
  const setFolder = useChatListStore((s) => s.setFolder);
  const filter = useChatListStore((s) => s.filter);
  const setFilter = useChatListStore((s) => s.setFilter);
  const [navigated, setNavigated] = useState(false);

  // A chat read under Unread stays until the view changes, rather than vanishing under the pointer.
  const view = `${folder}|${filter}`;
  const [kept, setKept] = useState({ view, ids: NO_IDS });
  const held = kept.view === view ? kept.ids : NO_IDS;
  const deferredQuery = useDeferredValue(query);
  const { listed, requests, rows, filtering, unseen, unreadHere, mentionsHere, showNetwork } =
    useMemo(
      () =>
        chatListContents({
          chats,
          chatPrefs,
          readAt,
          folder,
          filter,
          query: deferredQuery,
          held,
          titleOf,
        }),
      [chats, chatPrefs, readAt, folder, filter, deferredQuery, held, titleOf]
    );
  if (unseen.length > 0) setKept({ view, ids: new Set([...held, ...unseen]) });

  const trimmed = query.trim();
  const go = (next: Folder | null) => {
    setNavigated(true);
    setFolder(next);
  };
  useEscapeKey(folder !== null, () => go(null));
  const list = useSelectedInView({
    rows,
    listed,
    selectedId,
    folder,
    chatPrefs,
    searching: trimmed !== '',
    setFolder,
  });

  const filterContext = { prefs: chatPrefs, readAt };
  const protocol = folderProtocol(folder);
  const renderItem = ({ item: row }: ListRenderItemInfo<ChatListRow>) => {
    if (row.kind === 'chat') {
      return (
        <ChatRow
          chat={row.chat}
          title={titleOf(row.chat)}
          selfId={selfIdOf(row.chat)}
          unread={isUnread(row.chat, readAt)}
          network={showNetwork ? networkOf(row.chat) : undefined}
          prefs={prefsFor(chatPrefs, row.chat.id)}
          selected={row.chat.id === selectedId}
          onMenu={showMenu}
          onToggle={toggle}
        />
      );
    }
    const { unread, preview } = folderSummary(row, filterContext, titleOf);
    return <FolderRow row={row} unread={unread} preview={preview} onPress={() => go(row.folder)} />;
  };

  return (
    <>
      {chats.length > 0 && filtering ? (
        <FilterBar
          active={filter}
          onSelect={setFilter}
          unread={unreadHere}
          mentions={mentionsHere}
        />
      ) : null}
      <HistoryStatus compact protocol={protocol} showPartial={protocol !== undefined} />
      {chats.length === 0 ? (
        <NoChats />
      ) : (
        <Animated.View
          key={folder ?? 'all'}
          entering={navigated ? (folder ? Enter.fromRight() : Enter.fromLeft()) : undefined}
          className="flex-1">
          <FlashList
            ref={list}
            data={rows}
            keyExtractor={(row) => (row.kind === 'chat' ? row.chat.id : row.folder)}
            getItemType={(row) => row.kind}
            drawDistance={process.env.EXPO_OS === 'web' ? 2000 : undefined}
            ItemSeparatorComponent={Separator}
            contentInsetAdjustmentBehavior="automatic"
            ListEmptyComponent={<NothingListed query={trimmed} filter={filter} />}
            refreshControl={
              <RefreshControl
                refreshing={syncing}
                onRefresh={() => void sync()}
                tintColor={colors.brand}
              />
            }
            ListHeaderComponent={
              <>
                {requests.length > 0 && !folder ? <RequestsLink count={requests.length} /> : null}
              </>
            }
            ListFooterComponent={trimmed ? <SearchMessagesLink query={trimmed} /> : null}
            renderItem={renderItem}
          />
        </Animated.View>
      )}

      {menu ? (
        <ChatMenu
          target={menu}
          onClose={() => setMenu(null)}
          titleOf={titleOf}
          selfIdOf={selfIdOf}
          onBlock={setBlocking}
        />
      ) : null}
      {blocking ? (
        <BlockSheet
          chatId={blocking.id}
          name={titleOf(blocking)}
          onClose={() => setBlocking(null)}
        />
      ) : null}
    </>
  );
}

function useSelectedInView({
  rows,
  listed,
  selectedId,
  folder,
  chatPrefs,
  searching,
  setFolder,
}: {
  rows: ChatListRow[];
  listed: Chat[];
  selectedId: string | undefined;
  folder: Folder | null;
  chatPrefs: ChatPrefsMap;
  searching: boolean;
  setFolder: (folder: Folder | null) => void;
}) {
  const list = useRef<FlashListRef<ChatListRow>>(null);
  const selectedIndex = rows.findIndex((row) => row.kind === 'chat' && row.chat.id === selectedId);
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
  const openSelectedFolder = useEffectEvent(() => {
    const selected = listed.find((c) => c.id === selectedId);
    if (!selected || selectedListed || searching) return;
    const home = homeFolder(selected, chatPrefs, isFolded);
    if (home !== folder) setFolder(home);
  });
  useEffect(() => {
    openSelectedFolder();
  }, [selectedId]);
  return list;
}

function folderSummary(
  row: Extract<ChatListRow, { kind: 'folder' }>,
  context: FilterContext,
  titleOf: (chat: Chat) => string
) {
  const unread = row.chats.filter((c) => isUnreadHere(c, context));
  return {
    unread: unread.length,
    preview:
      unread.length > 0
        ? nameList(unread, titleOf)
        : `${titleOf(row.latest)}: ${messagePreview(row.latest.lastMessage)}`,
  };
}

function NoChats() {
  const router = useRouter();
  const connecting = useChatStore(
    (s) =>
      s.status === 'connecting' ||
      Object.values(s.protocols).some(
        (p) => p.status === 'connecting' || p.history.status === 'fetching'
      )
  );
  if (connecting) return <ConnectingState />;
  return (
    <EmptyState
      icon="chatbubbles-outline"
      title="No chats yet"
      description="Start one with an Ethereum address on XMTP, a public key on Nostr, or a chat key on Status."
      actionLabel="New chat"
      onAction={() => router.push('/new-chat')}
    />
  );
}

function NothingListed({ query, filter }: { query: string; filter: ChatFilter }) {
  if (query) {
    return (
      <EmptyState
        icon="search-outline"
        title="No matching chats"
        description={`No chats match “${query}”.`}
      />
    );
  }
  if (filter === 'unread') {
    return (
      <EmptyState icon="search-outline" title="All caught up" description="Nothing unread here." />
    );
  }
  return (
    <EmptyState icon="search-outline" title="Nothing here" description="Try another filter." />
  );
}

function RequestsLink({ count }: { count: number }) {
  const router = useRouter();
  return (
    <Pressable
      testID="open-requests"
      accessibilityRole="button"
      onPress={() => router.push('/requests')}
      className="mx-gutter mb-2 min-h-tap flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-3">
      <Icon name="mail-unread-outline" size={20} tone="brand" />
      <View className="min-w-0 flex-1">
        <Text className="font-semibold">Requests</Text>
        <Text variant="caption">From people you haven’t replied to</Text>
      </View>
      <CountBadge count={count} />
    </Pressable>
  );
}

function SearchMessagesLink({ query }: { query: string }) {
  const router = useRouter();
  return (
    <ListItem
      testID="search-messages"
      title={<Text className="text-brand">Search messages for “{query}”</Text>}
      accessibilityLabel={`Search messages for ${query}`}
      leading={
        <View className="w-11 items-center">
          <Icon name="search-outline" size={20} tone="brand" />
        </View>
      }
      trailing={<Chevron />}
      onPress={() => router.push(`/search?q=${encodeURIComponent(query)}`)}
    />
  );
}
