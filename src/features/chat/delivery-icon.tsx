import { Icon, type IconTone } from '@/design';
import type { ChatMessage } from '@/core/messaging/types';

/** `tone` (or `color`) is for a message sent and not yet read; failed and read have their own. */
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
  const failed = message.status === 'failed';
  const settled = failed || message.readAt;
  return (
    <Icon
      name={
        failed ? 'alert-circle' : message.status === 'sending' ? 'time-outline' : 'checkmark-done'
      }
      size={size}
      tone={failed ? 'danger' : message.readAt ? 'brand' : tone}
      color={settled ? undefined : color}
    />
  );
}
