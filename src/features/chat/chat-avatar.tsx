import { View } from 'react-native';

import { Avatar, type AvatarProps, NetworkMark } from '@/design';
import { isLocalChat } from '@/core/messaging/bots';
import type { Chat, ParticipantId } from '@/core/messaging/types';
import { useBotAvatar } from './use-bot-avatar';

export function ChatAvatar({
  chat,
  selfId,
  size,
  network,
}: {
  chat: Chat;
  selfId: ParticipantId;
  size?: AvatarProps['size'];
  network?: string;
}) {
  const isBot = isLocalChat(chat.id);
  const bot = useBotAvatar(chat.id);
  const participant = chat.memberIds.find((id) => id !== selfId) ?? chat.id;

  const avatar = (
    <Avatar
      seed={isBot ? chat.id : participant}
      size={size}
      label={chat.kind !== 'dm' || isBot ? chat.title.replace(/^#/, '') : undefined}
      image={bot.avatar ?? chat.avatarUri}
      emoji={bot.emoji}
    />
  );
  if (!network) return avatar;

  return (
    <View>
      {avatar}
      <View className="absolute -bottom-0.5 -right-0.5 rounded-pill border-2 border-surface">
        <NetworkMark network={network} />
      </View>
    </View>
  );
}
