import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useState } from 'react';
import { View } from 'react-native';

import { IconButton, Text } from '@/design';
import { formatDuration } from '@/core/messaging/preview';
import type { MessageContent } from '@/core/messaging/types';

export interface VoiceRecorderProps {
  onRecorded(content: MessageContent): void;
  onError(message: string): void;
}

export function VoiceRecorder({ onRecorded, onError }: VoiceRecorderProps) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.LOW_QUALITY,
    // The desktop's recorder writes whatever the browser prefers; a phone can
    // only play the AAC that the `.m4a` name promises.
    web: { mimeType: 'audio/mp4', bitsPerSecond: 64000 },
  });
  const state = useAudioRecorderState(recorder, 250);

  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError('Microphone access is off for this app.');
      } else {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
    } catch {
      onError('Could not start recording.');
    }
    setStarting(false);
  };

  const finish = async (keep: boolean) => {
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      onError('Could not save that recording.');
      return;
    }

    const uri = recorder.uri;
    if (!keep || !uri) return;

    const durationMs = Math.round(state.durationMillis ?? 0);
    if (durationMs < 500) {
      onError('Too short. Hold on a moment longer.');
      return;
    }

    onRecorded({ kind: 'voice', uri, durationMs, name: 'voice.m4a', mimeType: 'audio/m4a' });
  };

  if (!state.isRecording) {
    return (
      <IconButton
        icon="mic-outline"
        label="Record a voice message"
        surface="outline"
        size={20}
        disabled={starting}
        onPress={start}
      />
    );
  }

  return (
    <View className="flex-row items-center gap-2">
      <IconButton
        icon="trash-outline"
        label="Discard recording"
        surface="outline"
        tone="danger"
        size={18}
        onPress={() => finish(false)}
      />

      <View className="flex-row items-center gap-1.5 rounded-pill bg-danger/15 px-3 py-2">
        <View className="h-2 w-2 rounded-full bg-danger" />
        <Text variant="caption" className="font-medium tabular-nums text-content">
          {formatDuration(state.durationMillis ?? 0)}
        </Text>
      </View>

      <IconButton
        icon="arrow-up"
        label="Send voice message"
        surface="brand"
        size={20}
        onPress={() => finish(true)}
      />
    </View>
  );
}
