import { useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cancelPrompt, useDevicePrompt } from "@/core/account/device-prompt";
import { IconButton, PrimaryScope, Space, Text, useThemeColors } from "@/design";
import { SHEET_DISMISS_MS, useSheetStore } from "@/design/components/sheet";
import { DevicePromptBody, devicePromptTitle } from "@/features/account/device-prompt";

/** The phone's dialogs and menus: a bottom sheet with the dialog's parts. */
export default function SheetRoute() {
  const colors = useThemeColors();
  const current = useSheetStore((s) => s.current);
  const prompt = useDevicePrompt((s) => s.prompt);
  const insets = useSafeAreaInsets();
  const shown = prompt
    ? {
        label: undefined,
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
    [],
  );

  return (
    <View
      style={{
        backgroundColor: colors.panel,
        paddingHorizontal: Space[4],
        paddingBottom: insets.bottom + Space[2],
      }}
    >
      <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: Space[3], paddingTop: Space[4] }}>
        {shown?.leading}
        <View style={{ flex: 1, minWidth: 0, gap: Space[1] }}>
          {shown?.label ? <Text variant="label">{shown.label}</Text> : null}
          {shown?.title ? (
            <Text variant="title" numberOfLines={2}>
              {shown.title}
            </Text>
          ) : null}
          {shown?.subtitle ? (
            <Text variant="meta" numberOfLines={1}>
              {shown.subtitle}
            </Text>
          ) : null}
        </View>
        <IconButton testID="sheet-close" icon="x" label="Close" onPress={() => shown?.onClose()} />
      </View>
      <PrimaryScope>
        <View style={{ gap: Space[3], paddingTop: Space[2] }}>{shown?.children}</View>
      </PrimaryScope>
    </View>
  );
}
