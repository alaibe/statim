import { View } from 'react-native';

import { ConfirmSheet, Text, toast } from '@/design';
import { errorMessage } from '@/core/errors';
import { useChatStore } from '@/core/messaging/chat-store';
import type { ChatId } from '@/core/messaging/types';
import { BarButton } from './bar-button';

export async function setBlocked(chatId: ChatId, blocked: boolean): Promise<boolean> {
  try {
    await useChatStore.getState().setBlocked(chatId, blocked);
    toast.success(blocked ? 'Blocked' : 'Unblocked');
    return true;
  } catch (error) {
    toast.error(errorMessage(error, 'Could not do that'));
    return false;
  }
}

export function BlockSheet({
  chatId,
  name,
  onClose,
}: {
  chatId: ChatId;
  name: string;
  onClose: () => void;
}) {
  return (
    <ConfirmSheet
      visible
      onClose={onClose}
      title={`Block ${name}?`}
      body="Nothing they send reaches you, and you cannot message them. The chat moves to Blocked, where you can unblock them."
      confirm={{
        testID: 'confirm-block',
        label: 'Block',
        tone: 'danger',
        onPress: async () => {
          if (await setBlocked(chatId, true)) onClose();
        },
      }}
    />
  );
}

export function BlockedBar({ chatId }: { chatId: ChatId }) {
  return (
    <View className="mx-gutter mb-2 gap-2">
      <Text variant="caption" className="text-center">
        You blocked this person. Nothing they send reaches you.
      </Text>
      <BarButton
        testID="unblock"
        icon="ban-outline"
        label="Unblock"
        onPress={() => void setBlocked(chatId, false)}
      />
    </View>
  );
}
