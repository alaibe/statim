import { type Href, router } from "expo-router";

// Left stacked, each click would add a screen and a dismissed dialog would leave its pane under the chat.
function fresh(): void {
  if (router.canDismiss()) router.dismissAll();
}

export function openChat(id: string): void {
  fresh();
  router.navigate(`/chat/${id}`);
}

export const openChatFromSheet = openChat;
export const openChatFromProfile = openChat;

export function openTab(href: Href): void {
  fresh();
  router.navigate(href);
}

export function leaveSettingsPage(): void {
  openTab("/settings");
}
