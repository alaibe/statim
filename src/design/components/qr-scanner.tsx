import { Modal, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PhoneHeader } from "./app-shell";
import { IconButton } from "./button";
import { QrReader, type QrReaderProps } from "./qr-reader";
import { Screen } from "./screen";
import { Text } from "./text";

export interface QrScannerProps extends Omit<QrReaderProps, "className"> {
  title: string;
  closeLabel?: string;
  hint: string;
  onClose(): void;
}

export function QrScanner({ title, closeLabel, hint, onClose, ...reader }: QrScannerProps) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <Screen edges={["bottom"]}>
          <PhoneHeader title={title} action={<IconButton icon="x" label={closeLabel ?? "Close"} onPress={onClose} />} />
          <QrReader {...reader} className="flex-1 px-4 pt-4" />
          <View className="px-4 pt-1">
            <Text size="sm" tone="muted">
              {hint}
            </Text>
          </View>
        </Screen>
      </SafeAreaProvider>
    </Modal>
  );
}
