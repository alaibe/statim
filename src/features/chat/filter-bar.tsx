import type { ChatFilter } from "@/core/messaging/folders";
import { type TabItem, Tabs } from "@/design";

const FILTERS: { id: ChatFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "Mentions" },
  { id: "dms", label: "DMs" },
  { id: "groups", label: "Groups" },
];

/** Views of the chat list as scrollable tabs, with the unread and mention counts in mono. */
export function FilterBar({
  active,
  onSelect,
  unread,
  mentions,
}: {
  active: ChatFilter;
  onSelect: (filter: ChatFilter) => void;
  unread: number;
  mentions: number;
}) {
  const items: TabItem<ChatFilter>[] = FILTERS.map(({ id, label }) => ({
    id,
    label,
    count: id === "unread" ? unread : id === "mentions" ? mentions : undefined,
  }));
  return <Tabs items={items} value={active} onChange={onSelect} />;
}
