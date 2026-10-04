import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useChatStore } from '@/core/messaging/chat-store';
import { protocolsNeedAttention } from '@/features/protocols/presentation';

export default function TabsLayout() {
  const attention = useChatStore((s) => protocolsNeedAttention(s.protocols));

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="(chats)">
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" md="chat" />
        <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(contacts)">
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="people" />
        <NativeTabs.Trigger.Label>Contacts</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(settings)">
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={!attention} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
