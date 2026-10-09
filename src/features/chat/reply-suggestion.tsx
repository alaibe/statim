import { View } from 'react-native';

import { Button, Card, ErrorText, IconButton, Text } from '@/design';
import type { ChatId } from '@/core/messaging/types';
import { useReplySuggestion } from './use-reply-suggestion';

export function ReplySuggestion({
  chatId,
  available,
  onUse,
}: {
  chatId: ChatId;
  available: boolean;
  onUse(text: string): void;
}) {
  const { suggestion, kind, dismiss } = useReplySuggestion(chatId, available);
  if (!suggestion) return null;
  return (
    <Card testID="ai-reply-suggestion" className="mx-gutter mb-2 gap-2 p-3">
      <View className="flex-row items-center justify-between">
        <Text variant="caption">
          {suggestion.status === 'pending' ? `Preparing a ${kind}…` : `Suggested ${kind}`}
        </Text>
        <IconButton icon="close" label="Dismiss reply suggestion" onPress={dismiss} size={18} />
      </View>
      {suggestion.status === 'error' ? <ErrorText>{suggestion.text}</ErrorText> : null}
      {suggestion.status === 'ready' ? (
        <>
          <Text numberOfLines={5}>{suggestion.text}</Text>
          <Text variant="micro">{suggestion.label} · Decision by Jev</Text>
          <Button
            testID="ai-use-reply"
            label="Use reply"
            size="sm"
            tone="neutral"
            onPress={() => {
              onUse(suggestion.text);
              dismiss();
            }}
          />
        </>
      ) : null}
    </Card>
  );
}
