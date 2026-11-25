import { FlashList, type FlashListRef, type ListRenderItemInfo } from "@shopify/flash-list";
import { useObserve } from "expo-observe";
import { useIsFocused, useRouter } from "expo-router";
import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { RefreshControl } from "react-native";
import Animated from "react-native-reanimated";
import { useAiConfig } from "@/core/ai/use-config";
import { reportError } from "@/core/app/report-error";
import { type ChatPrefs, type ChatPrefsMap, prefsFor } from "@/core/messaging/chat-prefs";
import { useChatStore } from "@/core/messaging/chat-store";
import {
  type ChatFilter,
  type ChatListRow,
  type FilterContext,
  type Folder,
  homeFolder,
  isUnreadHere,
  networkOf,
} from "@/core/messaging/folders";
import { messagePreview, nameList } from "@/core/messaging/preview";
import type { Chat, ChatId } from "@/core/messaging/types";
import { isUnread } from "@/core/messaging/unread";
import { EmptyState, Enter, Icon, type MenuAnchor, Row, Text, toast, useEscapeKey, useThemeColors } from "@/design";
import { useChatListStore } from "@/features/chat/chat-list-store";
import { FilterBar } from "@/features/chat/filter-bar";
import { useChatTitles } from "@/features/chat/use-display-names";
import { useUnreadCounts } from "@/features/chat/use-unread-counts";
import { BlockSheet } from "./block";
import { chatListContents, isFolded } from "./chat-list-contents";
import { ChatRow, ConnectingState, FolderRow } from "./chat-list-rows";
import { ChatMenu, type ChatMenuTarget } from "./chat-menu";

const NO_IDS: ReadonlySet<string> = new Set();

/** The toast after a swipe or a menu item, in the past tense of its button. */
const TOGGLED: Partial<Record<keyof ChatPrefs, [on: string, off: string]>> = {
  archived: ["Archived the chat", "Unarchived the chat"],
  muted: ["Muted the chat", "Unmuted the chat"],
  pinned: ["Pinned the chat", "Unpinned the chat"],
};

interface ChatListProps {
  query: string;
  selectedId?: string;
}

export function ChatList({ query, selectedId }: ChatListProps) {
  const colors = useThemeColors();
  const focused = useIsFocused();
  const aiConfig = useAiConfig();
  const badgeConfig = focused && (aiConfig?.replyBadges || aiConfig?.followUps) ? aiConfig : undefined;
  const badgesOn = badgeConfig !== undefined;
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(NO_IDS);

  const baseChats = useChatStore((s) => s.chats);
  const status = useChatStore((s) => s.status);

  const { markInteractive } = useObserve();
  useEffect(() => {
    if (baseChats.length > 0 || status === "ready" || status === "error") {
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
  const setPref = (id: ChatId, key: keyof ChatPrefs, value: boolean) =>
    setChatPref(id, { [key]: value }).catch(reportError);
  const toggle = (id: ChatId, key: keyof ChatPrefs) => {
    const on = !prefsFor(useChatStore.getState().chatPrefs, id)[key];
    void setPref(id, key, on);
    toast.success(TOGGLED[key]?.[on ? 0 : 1] ?? "Done", { label: "Undo", run: () => void setPref(id, key, !on) });
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
  const { listed, requests, rows, filtering, unseen, unreadHere, mentionsHere, showNetwork } = useMemo(
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
    [chats, chatPrefs, readAt, folder, filter, deferredQuery, held, titleOf],
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
    searching: trimmed !== "",
    setFolder,
  });
  useEffect(() => {
    if (badgesOn) list.current?.recomputeViewableItems();
  }, [badgesOn, list]);

  const filterContext = { prefs: chatPrefs, readAt };
  const renderItem = ({ item: row }: ListRenderItemInfo<ChatListRow>) => {
    if (row.kind === "chat") {
      return (
        <ChatRow
          chat={row.chat}
          aiConfig={visibleIds.has(row.chat.id) ? badgeConfig : undefined}
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
        <FilterBar active={filter} onSelect={setFilter} unread={unreadHere} mentions={mentionsHere} />
      ) : null}
      {chats.length === 0 ? (
        <NoChats />
      ) : (
        <Animated.View
          key={folder ?? "all"}
          entering={navigated ? (folder ? Enter.fromRight() : Enter.fromLeft()) : undefined}
          className="flex-1"
        >
          <FlashList
            ref={list}
            data={rows}
            extraData={visibleIds}
            onViewableItemsChanged={({ viewableItems }) => {
              if (!badgesOn) return;
              setVisibleIds(new Set(viewableItems.flatMap(({ item }) => (item.kind === "chat" ? [item.chat.id] : []))));
            }}
            keyExtractor={(row) => (row.kind === "chat" ? row.chat.id : row.folder)}
            getItemType={(row) => row.kind}
            drawDistance={process.env.EXPO_OS === "web" ? 2000 : undefined}
            contentInsetAdjustmentBehavior="automatic"
            ListEmptyComponent={<NothingListed query={trimmed} filter={filter} />}
            refreshControl={
              <RefreshControl refreshing={syncing} onRefresh={() => void sync()} tintColor={colors.accent} />
            }
            ListHeaderComponent={
              <>{requests.length > 0 && !folder ? <RequestsLink count={requests.length} /> : null}</>
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
      {blocking ? <BlockSheet chatId={blocking.id} name={titleOf(blocking)} onClose={() => setBlocking(null)} /> : null}
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
  const selectedIndex = rows.findIndex((row) => row.kind === "chat" && row.chat.id === selectedId);
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
  row: Extract<ChatListRow, { kind: "folder" }>,
  context: FilterContext,
  titleOf: (chat: Chat) => string,
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
      s.status === "connecting" ||
      Object.values(s.protocols).some((p) => p.status === "connecting" || p.history.status === "fetching"),
  );
  if (connecting) return <ConnectingState />;
  return (
    <EmptyState
      boot="no chats yet"
      text="Start one with an Ethereum address on XMTP, a public key on Nostr, or a chat key on Status."
      action={{ label: "New chat", keys: ["mod", "n"], onPress: () => router.push("/new-chat") }}
    />
  );
}

function NothingListed({ query, filter }: { query: string; filter: ChatFilter }) {
  if (query) return <EmptyState noMatch boot="no match" text={`No chats match “${query}”. Search messages instead.`} />;
  if (filter === "unread") return <EmptyState boot="all caught up" text="Nothing unread here." />;
  return <EmptyState noMatch boot="nothing here" text="Try another filter." />;
}

function RequestsLink({ count }: { count: number }) {
  const router = useRouter();
  return (
    <Row
      testID="open-requests"
      title="Requests"
      preview="From people you haven’t replied to"
      leading={<Icon name="mail-dot" size={20} tone="accent" />}
      meta={
        <Text variant="meta" tone="accent">
          {count}
        </Text>
      }
      trailing={<Icon name="chevron-right" size={16} tone="muted" />}
      onPress={() => router.push("/requests")}
    />
  );
}

function SearchMessagesLink({ query }: { query: string }) {
  const router = useRouter();
  return (
    <Row
      testID="search-messages"
      title={`Search messages for “${query}”`}
      leading={<Icon name="search" size={16} tone="muted" />}
      trailing={<Icon name="arrow-right" size={16} tone="muted" />}
      onPress={() => router.push(`/search?q=${encodeURIComponent(query)}`)}
    />
  );
}
