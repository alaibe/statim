import { getCurrentWindow } from "@tauri-apps/api/window";
import { Image } from "expo-image";
import { useGlobalSearchParams, useSegments } from "expo-router";
import { Fragment, type PropsWithChildren, useEffect } from "react";
import { useWindowDimensions, View, type ViewProps } from "react-native";

import { activeAccount, useAccountStore } from "@/core/account/account-store";
import { useChatStore } from "@/core/messaging/chat-store";
import { splitRequests } from "@/core/messaging/folders";
import { parseChatId } from "@/core/messaging/namespace";
import {
  Avatar,
  IconButton,
  Layer,
  Layout,
  Sidebar,
  SidebarEnd,
  SidebarGroup,
  SidebarItem,
  TitleBar,
  useThemeColors,
} from "@/design";
import { useChatTitles } from "@/features/chat/use-display-names";
import { protocolsNeedAttention } from "@/features/protocols/presentation";

import { COMMANDS, openPlace, PLACES, type PlaceId, placeOf, RAIL } from "./commands";
import { HistoryMenu } from "./history-menu";
import { useKeymap } from "./keymap";
import { ListColumn } from "./list-column";
import { openTab } from "./open";
import { Palette } from "./palette";
import { DIALOG_SEGMENTS, FULL_WINDOW_ROUTES } from "./routes";
import { ShortcutsOverlay } from "./shortcuts";
import { StatusBar } from "./status-bar";
import { UpdateBanner } from "./update-bar";

const mac = /Mac/.test(navigator.userAgent);

/** Below 860 the list and the detail take turns. */
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
  const onePane = width < ONE_PANE_AT;
  const showList = place !== "requests" && !(onePane && (chatId || segments.length > 2 || DIALOG_SEGMENTS.has(first)));
  const showDetail = !onePane || !showList;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WindowTitle place={place} chatId={chatId} />
      <UpdateBanner />
      <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
        <View {...region("sidebar")} style={{ zIndex: Layer.popover }}>
          <Places place={place} />
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

const appIcon = require("@/assets/images/favicon.png") as number;

function Places({ place }: { place: PlaceId }) {
  const colors = useThemeColors();
  const attention = useChatStore((s) => protocolsNeedAttention(s.protocols));
  const requests = useChatStore((s) => splitRequests(s.chats).requests.length);
  const account = useAccountStore((s) => activeAccount(s)?.label);
  const settings = PLACES.find((entry) => entry.id === "settings");
  const item = (entry: (typeof PLACES)[number]) => {
    const index = (RAIL.flat() as readonly PlaceId[]).indexOf(entry.id);
    const waiting = entry.id === "requests" ? requests : 0;
    return (
      <SidebarItem
        key={entry.id}
        place={{
          ...entry,
          keys: index < 0 ? ["mod", ","] : ["mod", String(index + 1)],
          count: waiting,
          news: entry.id === "settings" && attention,
          name: waiting
            ? `${entry.label}, ${waiting} waiting`
            : entry.id === "settings" && attention
              ? `${entry.label}, a protocol needs attention`
              : undefined,
          testID: `place-${entry.id}`,
        }}
        current={place === entry.id}
        onPress={() => openPlace(entry.id)}
      />
    );
  };
  return (
    <Sidebar app={<Image source={appIcon} accessibilityLabel="Statim" style={{ width: 20, height: 20 }} />}>
      {RAIL.map((group, at) => (
        <Fragment key={group.join()}>
          {at > 0 ? <SidebarGroup /> : null}
          {group.map((id) => item(PLACES.find((entry) => entry.id === id) ?? PLACES[0]))}
        </Fragment>
      ))}
      <SidebarEnd>
        {account ? (
          <SidebarItem
            place={{
              id: "account",
              label: account,
              icon: "circle-user",
              name: `Account: ${account}`,
              testID: "place-account",
            }}
            current={false}
            onPress={() => openTab("/accounts")}
          >
            <Avatar size={20} shape="square" label={account} ring={colors.side} />
          </SidebarItem>
        ) : null}
        {settings ? item(settings) : null}
      </SidebarEnd>
    </Sidebar>
  );
}

/** Where you are, in the title bar and as the window's title: `Alice — Statim`. */
function WindowTitle({ place, chatId }: { place: PlaceId; chatId?: string }) {
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
          <IconButton icon="arrow-left" label="Back" size="sm" onPress={() => run("back")} />
          <IconButton icon="arrow-right" label="Forward" size="sm" onPress={() => run("forward")} />
        </>
      }
      trailing={<IconButton icon="command" label="Command palette" size="sm" onPress={() => run("palette")} />}
    />
  );
}
