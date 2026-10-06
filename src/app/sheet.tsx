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
  const shown = prompt
    ? {
        title: devicePromptTitle(prompt),
        subtitle: undefined,
        leading: undefined,
        onClose: () => cancelPrompt(prompt),
        children: <DevicePromptBody prompt={prompt} />,
      }
    : current;

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
        {shown?.leading}
        <View className="min-w-0 flex-1">
          {shown?.title ? (
            <Text variant="title" numberOfLines={1}>
              {shown.title}
            </Text>
          ) : null}
          {shown?.subtitle ? (
            <Text variant="caption" numberOfLines={1}>
              {shown.subtitle}
            </Text>
          ) : null}
        </View>
        <IconButton
          testID="sheet-close"
          icon="close"
          label="Close"
          size={18}
          surface="sunken"
          onPress={() => shown?.onClose()}
        />
      </View>
      <View className="gap-3">{shown?.children}</View>
    </View>
  );
}
