import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { useWindowDimensions, View } from "react-native";

import { formatDuration } from "@/core/messaging/preview";
import { Icon, Pressable, Radius, Text, useThemeColors, withAlpha } from "@/design";
import { useLoadableUri } from "@/lib/loadable-uri";
import { MessageText } from "../message-text";
import { MediaViewer } from "./media-viewer";
import { HoverSave } from "./save-button";

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

export function useMessagePlayer(uri: string, looping: boolean, autoplay = looping) {
  const playable = useLoadableUri(uri);
  const player = useVideoPlayer(playable, (player) => {
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
          accessibilityLabel={caption ?? (gif ? "GIF" : "Video")}
          onPress={() => setOpen(true)}
        >
          <View style={{ pointerEvents: "none" }}>
            <VideoView
              player={player}
              style={{ width: boxWidth, height: boxHeight, borderRadius: Radius.md }}
              contentFit="cover"
              nativeControls={false}
            />
            {gif ? null : (
              <>
                <PlayOverlay />
                {durationMs ? <Duration ms={durationMs} /> : null}
              </>
            )}
          </View>
        </Pressable>
      </HoverSave>
      {caption ? <MessageText text={caption} fromMe={fromMe} /> : null}

      <MediaViewer visible={open} onClose={() => setOpen(false)} onSave={onSave} interactive={!gif}>
        {open ? <ViewerVideo uri={uri} gif={gif} /> : null}
      </MediaViewer>
    </View>
  );
}

/** On a video frame: a `void` scrim at 70% behind `fg`, whatever the theme. */
function Duration({ ms }: { ms: number }) {
  const colors = useThemeColors();
  return (
    <View
      className="absolute left-1.5 top-1.5 px-1.5 py-0.5"
      style={{ borderRadius: Radius.sm, backgroundColor: withAlpha(colors.void, 0.7) }}
    >
      <Text variant="meta" tone="fg">
        {formatDuration(ms)}
      </Text>
    </View>
  );
}

export function PlayOverlay() {
  const colors = useThemeColors();
  return (
    <View className="absolute inset-0 items-center justify-center">
      <View
        className="h-12 w-12 items-center justify-center pl-1"
        style={{ borderRadius: Radius.md, backgroundColor: withAlpha(colors.void, 0.7) }}
      >
        <Icon name="play" size={24} tone="fg" />
      </View>
    </View>
  );
}

function ViewerVideo({ uri, gif }: { uri: string; gif: boolean }) {
  const player = useMessagePlayer(uri, gif, true);
  return <VideoView player={player} style={{ flex: 1, minHeight: 0 }} contentFit="contain" nativeControls={!gif} />;
}
