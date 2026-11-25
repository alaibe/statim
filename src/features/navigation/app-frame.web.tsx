import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGlobalSearchParams, useSegments } from "expo-router";
import { type PropsWithChildren, useEffect } from "react";
import { useWindowDimensions, View, type ViewProps } from "react-native";

import { useChatStore } from "@/core/messaging/chat-store";
import { splitRequests } from "@/core/messaging/folders";
import { parseChatId } from "@/core/messaging/namespace";
import { IconButton, Layout, Sidebar, SidebarGroup, SidebarItem, TitleBar, useThemeColors } from "@/design";
import { useChatTitles } from "@/features/chat/use-display-names";
import { protocolsNeedAttention } from "@/features/protocols/presentation";

import { COMMANDS, openPlace, PLACES, type PlaceId, placeOf, useOverlays } from "./commands";
import { HistoryMenu } from "./history-menu";
import { useKeymap } from "./keymap";
import { ListColumn } from "./list-column";
import { Palette } from "./palette";
import { DIALOG_SEGMENTS, FULL_WINDOW_ROUTES } from "./routes";
import { ShortcutsOverlay } from "./shortcuts";
import { StatusBar } from "./status-bar";
import { UpdateBanner } from "./update-bar";

const mac = /Mac/.test(navigator.userAgent);

/** Below 1100 the sidebar collapses to icons; below 860 the list and the detail take turns. */
const COLLAPSE_AT = 1100;
const ONE_PANE_AT = 860;

/** F6 finds the regions by these. */
const region = (name: string) => ({ dataSet: { region: name } }) as ViewProps;

const run = (id: string) => COMMANDS.find((command) => command.id === id)?.run({ segments: [] });

/** The window's regions: title bar, sidebar of places, list, detail and status bar, on `void`, `side` and `bg`. */
export function AppFrame({ children }: PropsWithChildren) {
  const colors = useThemeColors();
  const segments = useSegments() as string[];
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const { width } = useWindowDimensions();
  const collapsedByHand = useOverlays((s) => s.sidebarCollapsed);
  const chatId = segments[0] === "chat" && id ? (parseChatId(id) ?? undefined) : undefined;
  useKeymap(segments, chatId);

  const first = segments[0];
  if (first === undefined || FULL_WINDOW_ROUTES.has(first)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <TitleBar mac={mac} place="Statim" />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    );
  }

  const place = placeOf(segments);
  const collapsed = collapsedByHand || width < COLLAPSE_AT;
  const onePane = width < ONE_PANE_AT;
  const showList = place !== "requests" && !(onePane && (chatId || segments.length > 2 || DIALOG_SEGMENTS.has(first)));
  const showDetail = !onePane || !showList;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WindowTitle place={place} chatId={chatId} collapsed={collapsed} />
      <UpdateBanner />
      <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
        <View {...region("sidebar")}>
          <Places place={place} collapsed={collapsed} />
        </View>
        {showList ? (
          <View
            {...region("list")}
            style={{
              width: onePane ? undefined : Layout.list,
              flex: onePane ? 1 : undefined,
              borderRightWidth: 1,
              borderColor: colors.line,
            }}
          >
            <ListColumn place={place} />
          </View>
        ) : null}
        {showDetail ? (
          <View {...region("detail")} style={{ flex: 1, minWidth: 0 }}>
            {children}
          </View>
        ) : null}
      </View>
      <StatusBar chatId={chatId} />
      <Palette />
      <ShortcutsOverlay />
      <HistoryMenu />
    </View>
  );
}

function Places({ place, collapsed }: { place: PlaceId; collapsed: boolean }) {
  const attention = useChatStore((s) => protocolsNeedAttention(s.protocols));
  const requests = useChatStore((s) => splitRequests(s.chats).requests.length);
  const main = PLACES.filter((entry) => entry.id !== "requests" && entry.id !== "archive");
  const folders = PLACES.filter((entry) => entry.id === "requests" || entry.id === "archive");
  const item = (entry: (typeof PLACES)[number], index: number) => (
    <SidebarItem
      key={entry.id}
      place={{
        ...entry,
        keys: ["mod", String(index + 1)],
        count: entry.id === "requests" ? requests : undefined,
        news: entry.id === "settings" ? attention : entry.id === "requests" && requests > 0,
        testID: `place-${entry.id}`,
      }}
      current={place === entry.id}
      collapsed={collapsed}
      onPress={() => openPlace(entry.id)}
    />
  );
  return (
    <Sidebar collapsed={collapsed}>
      <View style={{ height: 12 }} />
      {main.map((entry) => item(entry, PLACES.indexOf(entry)))}
      {collapsed ? <View style={{ height: 16 }} /> : <SidebarGroup label="Folders" />}
      {folders.map((entry) => item(entry, PLACES.indexOf(entry)))}
    </Sidebar>
  );
}

/** Where you are, in the title bar and as the window's title: `Alice — Statim`. */
function WindowTitle({ place, chatId, collapsed }: { place: PlaceId; chatId?: string; collapsed: boolean }) {
  const chat = useChatStore((s) => (chatId ? s.chats.find((entry) => entry.id === chatId) : undefined));
  const { titleOf } = useChatTitles(chat ? [chat] : []);
  const label = PLACES.find((entry) => entry.id === place)?.label ?? "Statim";
  const item = chat ? titleOf(chat) : undefined;

  useEffect(() => {
    void getCurrentWindow()
      .setTitle(`${item ?? label} — Statim`)
      .catch(() => {});
  }, [item, label]);

  return (
    <TitleBar
      mac={mac}
      place={label}
      item={item}
      leading={
        <>
          {collapsed ? (
            <IconButton icon="panel-left" label="Expand the sidebar" size="sm" onPress={() => run("toggle-sidebar")} />
          ) : null}
          <IconButton icon="arrow-left" label="Back" size="sm" onPress={() => run("back")} />
          <IconButton icon="arrow-right" label="Forward" size="sm" onPress={() => run("forward")} />
        </>
      }
      trailing={<IconButton icon="command" label="Command palette" size="sm" onPress={() => run("palette")} />}
    />
  );
}
