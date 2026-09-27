import { router, type Href } from 'expo-router';

/** Opens a chat from a list; see open.web.ts for the desktop. */
export function openChat(id: string): void {
  router.navigate(`/chat/${id}`);
}

/** From the new-chat sheet: the sheet goes and the chat takes its place. */
export function openChatFromSheet(id: string): void {
  router.dismissTo(`/chat/${id}`);
}

/** From a profile: the chat replaces it. */
export function openChatFromProfile(id: string): void {
  router.replace(`/chat/${id}`);
}

export function openTab(href: Href): void {
  router.navigate(href);
}
