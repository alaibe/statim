import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { View } from "react-native";
import { reportError } from "@/core/app/report-error";
import { formatDuration } from "@/core/messaging/preview";
import { Icon, Pressable, Text, useThemeColors } from "@/design";
import { useLoadableUri } from "@/lib/loadable-uri";
import { waveformBars } from "./format";

interface VoiceBubbleProps {
  uri: string;
  durationMs: number;
  fromMe: boolean;
  seed: string;
}

export function VoiceBubble({ uri, durationMs, fromMe, seed }: VoiceBubbleProps) {
  const colors = useThemeColors();
  const playable = useLoadableUri(uri);
  const player = useAudioPlayer(playable ? { uri: playable } : null);
  const status = useAudioPlayerStatus(player);

  const bars = waveformBars(seed);
  const total = status.duration ? status.duration * 1000 : durationMs;
  const played = status.currentTime ? (status.currentTime * 1000) / Math.max(total, 1) : 0;

  const tint = fromMe ? colors["fg"] : colors.accent;
  const dim = fromMe ? colors["fg"] : colors.subtle;

  return (
    <View className="min-w-[200px] flex-row items-center gap-3 py-0.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pause" : "Play voice message"}
        onPress={() => {
          if (status.playing) {
            player.pause();
            return;
          }
          if (status.didJustFinish || played >= 0.999) player.seekTo(0).catch(reportError);
          player.play();
        }}
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-side">
          <Icon name={status.playing ? "pause" : "play"} size={20} color={tint} />
        </View>
      </Pressable>

      <View className="flex-1 gap-1">
        <View className="h-6 flex-row items-center gap-[2px]">
          {bars.map((height, index) => {
            const reached = index / bars.length <= played;
            return (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: `${height * 100}%`,
                  borderRadius: 1,
                  backgroundColor: reached ? tint : dim,
                  opacity: reached ? 1 : 0.35,
                }}
              />
            );
          })}
        </View>
        <Text variant="caption" className={fromMe ? "text-fg/70" : undefined}>
          {formatDuration(status.playing || played > 0 ? (status.currentTime ?? 0) * 1000 : total)}
        </Text>
      </View>
    </View>
  );
}
