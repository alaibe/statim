import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { VideoView } from 'expo-video';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/design';
import { stickerLabel } from '@/core/messaging/preview';
import { stickerFormat } from '@/core/messaging/stickers';
import type { MessageContent } from '@/core/messaging/types';
import { useKeyedLoad } from '@/lib/use-keyed-load';

import { loadLottie } from './lottie';
import { StickerAnimation } from './sticker-animation';
import { useMessagePlayer } from './video-bubble';

type Sticker = Extract<MessageContent, { kind: 'sticker' }>;

const SIDE = 180;

interface Box {
  width: number;
  height: number;
}

export function StickerBubble({ sticker }: { sticker: Sticker }) {
  const { uri, emoji } = sticker;
  const format = stickerFormat(sticker.mimeType);
  const box = boxFor(sticker.width, sticker.height);
  const [failed, setFailed] = useState<string>();
  const fail = () => setFailed(uri);
  const animation = useKeyedLoad(format === 'lottie' ? uri : null, loadLottie);

  let shown: ReactNode;
  if (failed === uri || animation.error) {
    shown = <StickerEmoji emoji={emoji} box={box} />;
  } else if (format === 'lottie') {
    shown = animation.value ? (
      <StickerAnimation animation={animation.value} {...box} />
    ) : (
      <View style={box} />
    );
  } else if (format === 'video') {
    shown = <StickerVideo uri={uri} box={box} onError={fail} />;
  } else {
    shown = (
      <Image source={{ uri }} recyclingKey={uri} style={box} contentFit="contain" onError={fail} />
    );
  }

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={stickerLabel(emoji)}>
      {shown}
    </View>
  );
}

function boxFor(width?: number, height?: number): Box {
  const ratio = width && height ? width / height : 1;
  return ratio >= 1
    ? { width: SIDE, height: Math.round(SIDE / ratio) }
    : { width: Math.round(SIDE * ratio), height: SIDE };
}

function StickerVideo({ uri, box, onError }: { uri: string; box: Box; onError(): void }) {
  const player = useMessagePlayer(uri, true);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') onError();
  });

  return (
    <VideoView
      player={player}
      style={box}
      contentFit="contain"
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
    />
  );
}

/** What is left when this device cannot decode the sticker, as can happen with WEBM. */
function StickerEmoji({ emoji, box }: { emoji?: string; box: Box }) {
  return (
    <View style={box} className="items-center justify-center">
      {emoji ? (
        <Text style={{ fontSize: Math.round(box.height / 2) }}>{emoji}</Text>
      ) : (
        <Text variant="caption">Sticker</Text>
      )}
    </View>
  );
}
