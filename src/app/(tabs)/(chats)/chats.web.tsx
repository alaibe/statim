import { EmptyState } from "@/design";

/** On the desktop the list is the list region's; the detail waits for a chat. */
export default function ChatsScreen() {
  return <EmptyState noMatch boot="no chat open" text="Pick a chat from the list, or start one." />;
}
