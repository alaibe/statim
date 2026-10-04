import { useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  DRAG_REGION,
  Icon,
  IconButton,
  type IconName,
  Pressable,
  SearchField,
  Text,
} from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import { ChatList } from '@/features/chat/chat-list';
import { chatSearchPlaceholder, FolderHeader } from '@/features/chat/chat-list-rows';
import { useChatListStore } from '@/features/chat/chat-list-store';
import { ContactList, type ContactSort } from '@/features/contacts/contact-list';
import { SettingsAccount, useEnsName } from '@/features/settings/settings-account';
import { openTab } from '@/features/navigation/open';
import { protocolsNeedAttention } from '@/features/protocols/presentation';
import {
  SettingsSections,
  settingsPageFor,
  useSettingsKeys,
} from '@/features/settings/settings-sections';

import { DIALOG_SEGMENTS } from './routes';
import { UpdateBar } from './update-bar';

type Tab = 'chats' | 'contacts' | 'settings';

const TABS: {
  id: Tab;
  label: string;
  icon: IconName;
  href: '/chats' | '/contacts' | '/settings';
}[] = [
  { id: 'chats', label: 'Chats', icon: 'chatbubbles-outline', href: '/chats' },
  { id: 'contacts', label: 'Contacts', icon: 'people-outline', href: '/contacts' },
  { id: 'settings', label: 'Settings', icon: 'hardware-chip-outline', href: '/settings' },
];

/** The traffic lights sit inside the card's top-left corner; the title row clears them. */
const TRAFFIC_LIGHTS_WIDTH = 64;

/**
 * The left column of the desktop window: the list for the active tab, with
 * search above it and the tab strip below. Settings opens in the pane, so the
 * list stays where it was.
 */
export function DesktopSidebar() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const params = useGlobalSearchParams<{ id?: string }>();

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<ContactSort>('name');
  const [sorting, setSorting] = useState(false);
  const folder = useChatListStore((s) => s.folder);
  const setFolder = useChatListStore((s) => s.setFolder);
  const attention = useChatStore((s) => protocolsNeedAttention(s.protocols));

  // Dialogs float over the window, so the sidebar keeps the tab they were opened from.
  const routed: Tab | null = segments.includes('(contacts)')
    ? 'contacts'
    : segments.includes('(settings)')
      ? 'settings'
      : DIALOG_SEGMENTS.has(segments[0])
        ? null
        : 'chats';
  const [lastTab, setLastTab] = useState<Tab>('chats');
  if (routed && routed !== lastTab) setLastTab(routed);
  const tab = routed ?? lastTab;
  const selectedId = segments[0] === 'chat' ? params.id : undefined;
  const settingsPage = settingsPageFor(segments, params.id);

  // Keys and the ENS name can only change on a settings page, so that is when they reload.
  const revision = tab === 'settings' ? (settingsPage ?? 'settings') : null;
  const keys = useSettingsKeys(revision);
  const ensName = useEnsName(revision);
  const openFolder = tab === 'chats' ? folder : null;

  return (
    <View
      style={{ borderCurve: 'continuous' }}
      className="w-[320px] flex-1 overflow-hidden rounded-card bg-surface shadow-md">
      <View {...DRAG_REGION} className="flex-row items-center px-2 pb-1 pt-2">
        <View style={{ width: TRAFFIC_LIGHTS_WIDTH }} />
        {openFolder ? (
          <FolderHeader folder={openFolder} onBack={() => setFolder(null)} />
        ) : (
          <Text variant="title" className="flex-1 text-center font-semibold">
            {TABS.find((entry) => entry.id === tab)?.label}
          </Text>
        )}
        <View
          className="flex-row items-center justify-end"
          style={{ minWidth: TRAFFIC_LIGHTS_WIDTH }}>
          {tab === 'settings' ? null : tab === 'contacts' ? (
            <IconButton
              icon="swap-horizontal-outline"
              label="Sort contacts"
              onPress={() => setSorting(true)}
            />
          ) : (
            <IconButton
              icon="people-outline"
              label="New group"
              onPress={() => router.push('/new-chat?mode=group')}
            />
          )}
          {tab === 'settings' ? null : (
            <IconButton
              icon="create-outline"
              label="New message"
              tone="brand"
              onPress={() => router.push('/new-chat')}
            />
          )}
        </View>
      </View>

      {tab === 'settings' ? null : (
        <SearchField
          className="mx-3 mb-2 bg-surface-raised"
          placeholder={tab === 'contacts' ? 'Search' : chatSearchPlaceholder(openFolder)}
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
        />
      )}

      <View className="flex-1">
        {tab === 'settings' ? (
          <ScrollView>
            <SettingsAccount ensName={ensName} />
            <SettingsSections keys={keys} selected={settingsPage} compact />
          </ScrollView>
        ) : tab === 'contacts' ? (
          <ContactList
            query={query}
            sortBy={sortBy}
            sorting={sorting}
            onSort={setSortBy}
            onCloseSort={() => setSorting(false)}
            selectedChatId={selectedId}
          />
        ) : (
          <ChatList query={query} selectedId={selectedId} />
        )}
      </View>

      <UpdateBar />

      <View className="flex-row border-t border-line">
        {TABS.map((entry) => {
          const active = entry.id === tab;
          return (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={entry.label}
              onPress={() => openTab(entry.href)}
              className="flex-1 items-center gap-0.5 py-2">
              <View>
                <Icon name={entry.icon} size={22} tone={active ? 'brand' : 'muted'} />
                {entry.id === 'settings' && attention ? (
                  <View className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-pill border-2 border-surface bg-warning" />
                ) : null}
              </View>
              <Text
                variant="caption"
                className={active ? 'font-semibold text-brand' : 'text-content-muted'}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
