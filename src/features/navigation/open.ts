import { type Href, router } from "expo-router";

export function openChat(id: string): void {
  router.navigate(`/chat/${id}`);
}

export function openChatFromSheet(id: string): void {
  router.dismissTo(`/chat/${id}`);
}

export function openChatFromProfile(id: string): void {
  router.replace(`/chat/${id}`);
}

export function openTab(href: Href): void {
  router.navigate(href);
}

/** Back to the settings list, even when the page was opened from a chat. */
export function leaveSettingsPage(): void {
  router.dismissTo("/settings");
}
