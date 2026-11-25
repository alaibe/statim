import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useState } from "react";
import { View } from "react-native";
import { formatDuration } from "@/core/messaging/preview";
import type { MessageContent } from "@/core/messaging/types";
import { IconButton, Radius, Tag, Text, useThemeColors, withAlpha } from "@/design";

interface VoiceRecorderProps {
  onRecorded(content: MessageContent): void;
  onError(message: string): void;
}

export function VoiceRecorder({ onRecorded, onError }: VoiceRecorderProps) {
  const colors = useThemeColors();
  const recorder = useAudioRecorder({
    ...RecordingPresets.LOW_QUALITY,
    // A phone can only play the AAC that the `.m4a` name promises.
    web: { mimeType: "audio/mp4", bitsPerSecond: 64000 },
  });
  const state = useAudioRecorderState(recorder, 250);

  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError("Microphone access is off for this app.");
      } else {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
    } catch {
      onError("Could not start recording.");
    }
    setStarting(false);
  };

  const finish = async (keep: boolean) => {
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      onError("Could not save that recording.");
      return;
    }

    const uri = recorder.uri;
    if (!keep || !uri) return;

    const durationMs = Math.round(state.durationMillis ?? 0);
    if (durationMs < 500) {
      onError("Too short. Hold on a moment longer.");
      return;
    }

    onRecorded({ kind: "voice", uri, durationMs, name: "voice.m4a", mimeType: "audio/m4a" });
  };

  if (!state.isRecording) {
    return <IconButton icon="mic" label="Record a voice message" disabled={starting} onPress={() => void start()} />;
  }

  return (
    <View className="flex-row items-center gap-2">
      <IconButton icon="trash-2" label="Discard recording" tone="danger" onPress={() => void finish(false)} />

      <View
        className="flex-row items-center gap-2 px-3 py-2"
        style={{ borderRadius: Radius.md, backgroundColor: withAlpha(colors.danger, 0.12) }}
      >
        <Tag tone="err" label="REC" dot />
        <Text variant="meta" tone="fg">
          {formatDuration(state.durationMillis ?? 0)}
        </Text>
      </View>

      <IconButton icon="arrow-up" label="Send voice message" tone="accent" onPress={() => void finish(true)} />
    </View>
  );
}
