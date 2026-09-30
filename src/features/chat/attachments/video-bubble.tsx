import { useEffect } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { View, useWindowDimensions } from 'react-native';

import { MessageText } from '../message-text';

interface VideoBubbleProps {
  uri: string;
  width?: number;
  height?: number;
  caption?: string;
  gif?: boolean;
  fromMe: boolean;
}

/** A GIF or a video sticker loops silently from the start; any other video waits for its controls. */
export function useMessagePlayer(uri: string, looping: boolean) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = looping;
    player.muted = looping;
  });
  // On the desktop the <video> element only exists once the view has mounted.
  useEffect(() => {
    if (looping) player.play();
  }, [looping, player]);
  return player;
}

export function VideoBubble({ uri, width, height, caption, gif, fromMe }: VideoBubbleProps) {
  const player = useMessagePlayer(uri, Boolean(gif));
  const { width: screenWidth } = useWindowDimensions();
  const boxWidth = Math.min(screenWidth * 0.62, 260);
  const boxHeight = Math.min((boxWidth * (height || 9)) / (width || 16), 320);

  return (
    <View className="gap-1.5">
      <VideoView
        player={player}
        style={{ width: boxWidth, height: boxHeight, borderRadius: 14 }}
        contentFit={gif ? 'cover' : 'contain'}
        nativeControls={!gif}
        fullscreenOptions={{ enable: !gif }}
      />
      {caption ? (
        <MessageText
          text={caption}
          fromMe={fromMe}
          className={fromMe ? 'text-bubble-out-on' : 'text-bubble-in-on'}
        />
      ) : null}
    </View>
  );
}
