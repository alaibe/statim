import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Text } from '@/design';
import { SHEET_DISMISS_MS, useSheetStore } from '@/design/components/sheet';
import { cancelPrompt, useDevicePrompt } from '@/core/account/device-prompt';
import { DevicePromptBody, devicePromptTitle } from '@/features/account/device-prompt';

export default function SheetRoute() {
  const current = useSheetStore((s) => s.current);
  const prompt = useDevicePrompt((s) => s.prompt);
  const insets = useSafeAreaInsets();
  const title = prompt ? devicePromptTitle(prompt) : current?.title;

  // Unmounting is how a swipe-to-dismiss reaches the owner.
  useEffect(
    () => () => {
      const { current: closing, afterClose } = useSheetStore.getState();
      useSheetStore.setState({ current: null, afterClose: null });
      closing?.onClose();
      if (afterClose) setTimeout(afterClose, SHEET_DISMISS_MS);
    },
    []
  );

  return (
    <View className="bg-surface px-gutter" style={{ paddingBottom: insets.bottom + 8 }}>
      <View className="min-h-tap flex-row items-center gap-3 py-3">
        {prompt ? null : current?.leading}
        <View className="min-w-0 flex-1">
          {title ? (
            <Text variant="title" numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {!prompt && current?.subtitle ? (
            <Text variant="caption" numberOfLines={1}>
              {current.subtitle}
            </Text>
          ) : null}
        </View>
        <IconButton
          testID="sheet-close"
          icon="close"
          label="Close"
          size={18}
          surface="sunken"
          onPress={() => (prompt ? cancelPrompt(prompt) : current?.onClose())}
        />
      </View>
      <View className="gap-3">
        {prompt ? <DevicePromptBody prompt={prompt} /> : current?.children}
      </View>
    </View>
  );
}
