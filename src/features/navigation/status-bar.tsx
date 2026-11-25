import type { ChatId } from "@/core/messaging/types";

/** Phones have no status bar; their live state is the header's subtitle. The desktop's is status-bar.web.tsx. */
export function StatusBar(_props: { chatId?: ChatId }) {
  return null;
}
