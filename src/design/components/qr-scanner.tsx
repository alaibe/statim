import { Modal, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ModalHeader } from "./modal-header";
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
        <Screen className="px-0" edges={["top", "bottom"]}>
          <ModalHeader title={title} closeLabel={closeLabel} onClose={onClose} className="px-4" />
          <QrReader {...reader} className="flex-1 px-4" />
          <View className="px-4 pt-1">
            <Text variant="caption">{hint}</Text>
          </View>
        </Screen>
      </SafeAreaProvider>
    </Modal>
  );
}
