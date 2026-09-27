import { View } from 'react-native';

import { Button, Text } from '@/design';
import type { ChatId } from '@/core/messaging/types';
import { answerRequest } from './requests';

export function RequestBar({ chatId }: { chatId: ChatId }) {
  return (
    <View className="gap-3 border-t border-line bg-surface-raised px-gutter pb-3 pt-3">
      <Text variant="caption" className="text-center">
        You have not accepted this request. Declining it takes the chat off your list without
        blocking the sender.
      </Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            testID="request-decline"
            label="Decline"
            tone="neutral"
            fullWidth
            onPress={() => answerRequest(chatId, 'declined')}
          />
        </View>
        <View className="flex-1">
          <Button
            testID="request-accept"
            label="Accept"
            fullWidth
            onPress={() => answerRequest(chatId, 'accepted')}
          />
        </View>
      </View>
    </View>
  );
}
