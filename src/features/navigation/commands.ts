import { type Href, router } from "expo-router";
import { create } from "zustand";

import { orderChats, prefsFor } from "@/core/messaging/chat-prefs";
import { useChatStore } from "@/core/messaging/chat-store";
import { type ChatFilter, splitRequests } from "@/core/messaging/folders";
import type { ChatId } from "@/core/messaging/types";
import { type IconName, runNewestToastAction, toast } from "@/design";
import { useChatListStore } from "@/features/chat/chat-list-store";

import { useChatHistory } from "./chat-history";
import { openChat, openTab } from "./open";

/** Where the person is, which picks the keys that apply and the status bar's hints. */
export type HintContext = "chord" | "writing" | "searching" | "palette" | "dialog" | "item" | "list";

export interface CommandScope {
  segments: readonly string[];
  /** The chat open in the detail, if any. */
  chatId?: ChatId;
}

export interface Command {
  id: string;
  label: string;
  group: "Actions" | "Go to" | "Chat" | "Window";
  icon?: IconName;
  /** As keycaps: `mod` is ⌘ on macOS and Ctrl elsewhere; a sequence is pressed one key after the other. */
  keys?: readonly string[];
  sequence?: boolean;
  /** The status bar's word for it, lowercase. */
  hint?: string;
  /** Whether it can run now. */
  when?(scope: CommandScope): boolean;
  run(scope: CommandScope): void;
}

/** The app's places: the sidebar on the desktop, the tab bar's first three on a phone, `G` then a letter everywhere. */
export const PLACES = [
  { id: "chats", label: "Chats", icon: "messages-square", href: "/chats", chord: "c" },
  { id: "contacts", label: "Contacts", icon: "contact-round", href: "/contacts", chord: "n" },
  { id: "settings", label: "Settings", icon: "settings", href: "/settings", chord: "s" },
  { id: "requests", label: "Requests", icon: "inbox", href: "/requests", chord: "r" },
  { id: "archive", label: "Archive", icon: "archive", href: "/chats", chord: "a" },
] as const satisfies readonly { id: string; label: string; icon: IconName; href: Href; chord: string }[];

export type PlaceId = (typeof PLACES)[number]["id"];

/** The sidebar's groups top to bottom, which ⌘1… follow; settings sits at its foot under ⌘,. */
export const RAIL = [
  ["chats", "contacts"],
  ["requests", "archive"],
] as const satisfies readonly (readonly PlaceId[])[];

/** Settings pages the palette reaches by name. */
const SETTINGS_PAGES = [
  ["Appearance", "/settings/appearance"],
  ["Privacy", "/settings/privacy"],
  ["Notifications", "/settings/notifications"],
  ["Plugins", "/settings/plugins"],
  ["Devices", "/settings/devices"],
  ["Recovery phrase", "/settings/recovery-phrase"],
  ["AI", "/settings/ai"],
  ["Command line", "/settings/command-line"],
  ["Accounts", "/accounts"],
] as const;

export function openPlace(id: PlaceId): void {
  const list = useChatListStore.getState();
  if (id === "archive") {
    list.setFolder("archive");
    openTab("/chats");
    return;
  }
  if (id === "chats") list.setFolder(null);
  openTab(PLACES.find((place) => place.id === id)?.href ?? "/chats");
}

/** The place the route belongs to; a chat or a dialog belongs to Chats. */
export function placeOf(segments: readonly string[]): PlaceId {
  if (segments.includes("(contacts)")) return "contacts";
  if (segments.includes("(settings)")) return "settings";
  if (segments.includes("requests")) return "requests";
  return useChatListStore.getState().folder === "archive" ? "archive" : "chats";
}

/** The palette, the help overlay and the hints read this; the shell opens them. */
interface Overlays {
  palette: boolean;
  shortcuts: boolean;
  set(change: Partial<Omit<Overlays, "set">>): void;
}

export const useOverlays = create<Overlays>((set) => ({
  palette: false,
  shortcuts: false,
  set: (change) => set(change),
}));

/** Accepted chats in the list's order, archived ones aside. */
function listedChats(): ChatId[] {
  const { chats, chatPrefs } = useChatStore.getState();
  return orderChats(splitRequests(chats).accepted, chatPrefs).map((chat) => chat.id);
}

function step(scope: CommandScope, by: 1 | -1): void {
  const ids = listedChats();
  if (ids.length === 0) return;
  const at = scope.chatId ? ids.indexOf(scope.chatId) : -1;
  const next = ids[at < 0 ? (by === 1 ? 0 : ids.length - 1) : Math.min(Math.max(at + by, 0), ids.length - 1)];
  if (next && next !== scope.chatId) openChat(next);
}

type Pref = "archived" | "muted" | "pinned";

const PAST: Record<Pref, [on: string, off: string]> = {
  archived: ["Archived the chat", "Unarchived the chat"],
  muted: ["Muted the chat", "Unmuted the chat"],
  pinned: ["Pinned the chat", "Unpinned the chat"],
};

/** Archive, mute and pin act at once and say so with Undo, as every undoable action does. */
export function toggleChatPref(id: ChatId, key: Pref): void {
  const store = useChatStore.getState();
  const before = Boolean(prefsFor(store.chatPrefs, id)[key]);
  void store.setChatPref(id, { [key]: !before }).then(() =>
    toast.success(PAST[key][before ? 1 : 0], {
      label: "Undo",
      run: () => void useChatStore.getState().setChatPref(id, { [key]: before }),
    }),
  );
}

const inChat = (scope: CommandScope) => Boolean(scope.chatId);

const FILTERS: readonly [ChatFilter, string][] = [
  ["all", "All chats"],
  ["unread", "Unread"],
  ["mentions", "Mentions"],
  ["dms", "Direct messages"],
  ["groups", "Groups"],
];

/** Every action the app has, once: keys, the palette, the app menu, the hints and the `?` overlay read this. */
export const COMMANDS: readonly Command[] = [
  {
    id: "palette",
    label: "Command palette",
    group: "Window",
    icon: "command",
    keys: ["mod", "k"],
    hint: "commands",
    run: () => useOverlays.getState().set({ palette: !useOverlays.getState().palette }),
  },
  {
    id: "new-message",
    label: "New message…",
    group: "Actions",
    icon: "square-pen",
    keys: ["mod", "n"],
    hint: "new",
    run: () => router.push("/new-chat"),
  },
  {
    id: "new",
    label: "New message…",
    group: "Actions",
    keys: ["n"],
    hint: "new",
    run: () => router.push("/new-chat"),
  },
  {
    id: "new-group",
    label: "New group…",
    group: "Actions",
    icon: "users",
    run: () => router.push("/new-chat?mode=group"),
  },
  {
    id: "find",
    label: "Search messages…",
    group: "Actions",
    icon: "search",
    keys: ["mod", "f"],
    run: (scope) => router.push(scope.chatId ? `/search?chatId=${encodeURIComponent(scope.chatId)}` : "/search"),
  },
  {
    id: "search",
    label: "Search this list",
    group: "Actions",
    keys: ["/"],
    hint: "search",
    run: () => focusListSearch(),
  },
  {
    id: "next",
    label: "Next chat",
    group: "Chat",
    keys: ["j"],
    hint: "move",
    run: (scope) => step(scope, 1),
  },
  { id: "next-arrow", label: "Next chat", group: "Chat", keys: ["down"], run: (scope) => step(scope, 1) },
  { id: "previous", label: "Previous chat", group: "Chat", keys: ["k"], run: (scope) => step(scope, -1) },
  { id: "previous-arrow", label: "Previous chat", group: "Chat", keys: ["up"], run: (scope) => step(scope, -1) },
  {
    id: "archive-chat",
    label: "Archive chat",
    group: "Chat",
    icon: "archive",
    keys: ["e"],
    hint: "archive",
    when: inChat,
    run: (scope) => scope.chatId && toggleChatPref(scope.chatId, "archived"),
  },
  {
    id: "mute-chat",
    label: "Mute chat",
    group: "Chat",
    icon: "volume-x",
    keys: ["m"],
    hint: "mute",
    when: inChat,
    run: (scope) => scope.chatId && toggleChatPref(scope.chatId, "muted"),
  },
  {
    id: "pin-chat",
    label: "Pin chat",
    group: "Chat",
    icon: "pin",
    keys: ["p"],
    when: inChat,
    run: (scope) => scope.chatId && toggleChatPref(scope.chatId, "pinned"),
  },
  {
    id: "reply",
    label: "Write in this chat",
    group: "Chat",
    icon: "reply",
    keys: ["r"],
    hint: "reply",
    when: inChat,
    run: () => focusComposer(),
  },
  {
    id: "close-chat",
    label: "Close chat",
    group: "Chat",
    keys: ["esc"],
    when: inChat,
    run: () => openTab("/chats"),
  },
  {
    id: "undo",
    label: "Undo",
    group: "Actions",
    icon: "undo",
    keys: ["mod", "z"],
    run: () => void runNewestToastAction(),
  },
  ...RAIL.flat().map((id, index): Command => {
    const place = PLACES.find((entry) => entry.id === id) ?? PLACES[0];
    return {
      id: `go-${id}`,
      label: place.label,
      group: "Go to",
      icon: place.icon,
      keys: ["mod", String(index + 1)],
      run: () => openPlace(id),
    };
  }),
  ...PLACES.map(
    (place): Command => ({
      id: `chord-${place.id}`,
      label: `Go to ${place.label.toLowerCase()}`,
      group: "Go to",
      keys: ["g", place.chord],
      sequence: true,
      hint: place.label.toLowerCase(),
      run: () => openPlace(place.id),
    }),
  ),
  {
    id: "settings",
    label: "Settings",
    group: "Go to",
    icon: "settings",
    keys: ["mod", ","],
    run: () => openPlace("settings"),
  },
  ...SETTINGS_PAGES.map(
    ([label, href]): Command => ({
      id: `settings-${href.split("/").at(-1)}`,
      label: `Settings › ${label}`,
      group: "Go to",
      icon: "settings",
      run: () => openTab(href),
    }),
  ),
  ...FILTERS.map(
    ([filter, label]): Command => ({
      id: `filter-${filter}`,
      label: `Show ${label.toLowerCase()}`,
      group: "Go to",
      icon: "messages-square",
      run: () => {
        const list = useChatListStore.getState();
        list.setFolder(null);
        list.setFilter(filter);
        openTab("/chats");
      },
    }),
  ),
  {
    id: "blocked",
    label: "Blocked chats",
    group: "Go to",
    icon: "ban",
    run: () => {
      useChatListStore.getState().setFolder("blocked");
      openTab("/chats");
    },
  },
  {
    id: "back",
    label: "Back",
    group: "Window",
    icon: "arrow-left",
    keys: ["mod", "["],
    run: () => history("back"),
  },
  {
    id: "forward",
    label: "Forward",
    group: "Window",
    icon: "arrow-right",
    keys: ["mod", "]"],
    run: () => history("forward"),
  },
  { id: "next-region", label: "Next region", group: "Window", keys: ["f6"], run: () => moveRegion(1) },
  {
    id: "previous-region",
    label: "Previous region",
    group: "Window",
    keys: ["shift", "f6"],
    run: () => moveRegion(-1),
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    group: "Window",
    icon: "keyboard",
    keys: ["?"],
    run: () => useOverlays.getState().set({ shortcuts: true }),
  },
];

/** The History menu's recent chats send `chat:` and the chat's id. */
const MENU_CHAT = "chat:";

/** The command an app menu item runs: a registry entry, or a recent chat from the History menu. */
export function menuCommand(id: string): Command | undefined {
  if (id.startsWith(MENU_CHAT)) {
    const chatId = id.slice(MENU_CHAT.length);
    return { id, label: "Open chat", group: "Go to", run: () => openChat(chatId) };
  }
  return COMMANDS.find((command) => command.id === id);
}

function history(direction: "back" | "forward") {
  const exists = (id: ChatId) => useChatStore.getState().chats.some((chat) => chat.id === id);
  const id = useChatHistory.getState().step(direction, exists);
  if (id) openChat(id);
}

/** The regions F6 cycles through, in the window's order. */
export const REGIONS = ["sidebar", "list", "detail"] as const;

function moveRegion(by: 1 | -1) {
  if (typeof document === "undefined") return;
  const regions = REGIONS.map((name) => document.querySelector<HTMLElement>(`[data-region="${name}"]`)).filter(
    (region): region is HTMLElement => region !== null,
  );
  const at = regions.findIndex((region) => region.contains(document.activeElement));
  const next = regions[(at + by + regions.length) % regions.length];
  next?.querySelector<HTMLElement>('[tabindex="0"], button, input, textarea, [contenteditable="true"]')?.focus();
}

function focusListSearch() {
  if (typeof document === "undefined") return;
  document.querySelector<HTMLElement>('[data-region="list"] [data-search]')?.focus();
}

function focusComposer() {
  if (typeof document === "undefined") return;
  document.querySelector<HTMLElement>('[data-testid="composer-input"]')?.focus();
}

/** Each context's keys, in the status bar page's order; a key that can't run now isn't shown. */
const HINTS: Partial<Record<HintContext, readonly string[]>> = {
  list: ["next", "archive-chat", "new", "search", "palette"],
  item: ["archive-chat", "reply", "palette"],
  chord: PLACES.map((place) => `chord-${place.id}`),
};

const FIXED: Partial<Record<HintContext, Hint[]>> = {
  writing: [
    { keys: ["enter"], action: "send" },
    { keys: ["esc"], action: "close" },
  ],
  searching: [
    { keys: ["enter"], action: "search" },
    { keys: ["down"], action: "move" },
  ],
  palette: [
    { keys: [">"], action: "actions" },
    { keys: ["#"], action: "chats" },
    { keys: ["enter"], action: "run" },
  ],
  dialog: [
    { keys: ["mod", "enter"], action: "confirm" },
    { keys: ["esc"], action: "cancel" },
  ],
};

export interface Hint {
  keys: readonly string[];
  action: string;
  sequence?: boolean;
}

/** The hints of a context, at most five. */
export function hintsFor(context: HintContext, scope: CommandScope): Hint[] {
  const fixed = FIXED[context];
  if (fixed) return fixed;
  return (HINTS[context] ?? [])
    .map((id) => COMMANDS.find((command) => command.id === id))
    .filter((command): command is Command => Boolean(command?.keys) && (!command?.when || command.when(scope)))
    .map((command) => ({
      keys: command.id === "next" ? ["j", "k"] : (command.keys ?? []),
      action: command.hint ?? command.label.toLowerCase(),
      sequence: command.sequence,
    }))
    .slice(0, context === "chord" ? undefined : 5);
}
