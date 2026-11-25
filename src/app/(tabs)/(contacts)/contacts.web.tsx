import { EmptyState } from "@/design";

/** On the desktop the contacts are the list region's; the detail waits for one. */
export default function ContactsScreen() {
  return <EmptyState noMatch boot="no contact open" text="Pick a contact to open your chat with them." />;
}
