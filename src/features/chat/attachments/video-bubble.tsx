import { useEffect, useState } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { View, useWindowDimensions } from 'react-native';

import { formatDuration } from '@/core/messaging/preview';
import { Icon, Pressable, Text } from '@/design';
import { MessageText } from '../message-text';
import { MediaViewer } from './media-viewer';
import { HoverSave } from './save-button';

interface VideoBubbleProps {
  uri: string;
  width?: number;
  height?: number;
  durationMs?: number;
  caption?: string;
  gif?: boolean;
  fromMe: boolean;
  onSave?: () => void;
}

/** A GIF or a video sticker loops silently from the start; any other video waits to be opened. */
export function useMessagePlayer(uri: string, looping: boolean, autoplay = looping) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = looping;
    player.muted = looping;
  });
  // On the desktop the <video> element only exists once the view has mounted.
  useEffect(() => {
    if (autoplay) player.play();
  }, [autoplay, player]);
  return player;
}

export function VideoBubble({
  uri,
  width,
  height,
  durationMs,
  caption,
  gif = false,
  fromMe,
  onSave,
}: VideoBubbleProps) {
  const player = useMessagePlayer(uri, gif);
  const [open, setOpen] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const boxWidth = Math.min(screenWidth * 0.62, 260);
  const boxHeight = Math.min((boxWidth * (height || 9)) / (width || 16), 320);

  return (
    <View className="gap-1.5">
      <HoverSave onSave={onSave}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={caption ?? (gif ? 'GIF' : 'Video')}
          onPress={() => setOpen(true)}
          pressScale={0.99}>
          <View style={{ pointerEvents: 'none' }}>
            <VideoView
              player={player}
              style={{ width: boxWidth, height: boxHeight, borderRadius: 14 }}
              contentFit="cover"
              nativeControls={false}
            />
            {gif ? null : (
              <>
                <PlayOverlay />
                {durationMs ? (
                  <View className="absolute left-1.5 top-1.5 rounded-pill bg-black/45 px-1.5 py-0.5">
                    <Text variant="micro" className="text-white">
                      {formatDuration(durationMs)}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </Pressable>
      </HoverSave>
      {caption ? (
        <MessageText
          text={caption}
          fromMe={fromMe}
          className={fromMe ? 'text-bubble-out-on' : 'text-bubble-in-on'}
        />
      ) : null}

      <MediaViewer visible={open} onClose={() => setOpen(false)} onSave={onSave} interactive={!gif}>
        {open ? <ViewerVideo uri={uri} gif={gif} /> : null}
      </MediaViewer>
    </View>
  );
}

export function PlayOverlay() {
  return (
    <View className="absolute inset-0 items-center justify-center">
      <View className="h-12 w-12 items-center justify-center rounded-pill bg-black/55 pl-1">
        <Icon name="play" size={22} color="white" />
      </View>
    </View>
  );
}

function ViewerVideo({ uri, gif }: { uri: string; gif: boolean }) {
  const player = useMessagePlayer(uri, gif, true);
  return (
    <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={!gif} />
  );
}
