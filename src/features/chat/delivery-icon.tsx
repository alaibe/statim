import { View } from 'react-native';

import { Icon, type IconTone } from '@/design';
import type { ChatMessage } from '@/core/messaging/types';

/**
 * Telegram's ticks: one once sent, two once read. `tone` (or `color`) is for a
 * message sent and not yet read; failed and read have their own.
 */
export function DeliveryIcon({
  message,
  size,
  tone = 'subtle',
  color,
}: {
  message: Pick<ChatMessage, 'status' | 'readAt'>;
  size: number;
  tone?: IconTone;
  color?: string;
}) {
  if (message.status === 'failed') return <Icon name="alert-circle" size={size} tone="danger" />;
  if (message.status === 'sending')
    return <Icon name="time-outline" size={size} tone={tone} color={color} />;
  if (!message.readAt) return <Icon name="checkmark" size={size} tone={tone} color={color} />;
  return (
    <View className="flex-row">
      <Icon name="checkmark" size={size} tone="brand" />
      <View style={{ marginLeft: -size * 0.6 }}>
        <Icon name="checkmark" size={size} tone="brand" />
      </View>
    </View>
  );
}
