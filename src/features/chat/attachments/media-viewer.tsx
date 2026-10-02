import type { ReactNode } from 'react';
import { Modal, Pressable as RNPressable, View } from 'react-native';

import { Icon, Pressable } from '@/design';
import { SaveButton } from './save-button';

interface MediaViewerProps {
  visible: boolean;
  onClose: () => void;
  onSave?: () => void;
  children: ReactNode;
}

export function MediaViewer({ visible, onClose, onSave, children }: MediaViewerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black">
        <RNPressable accessibilityLabel="Close" className="absolute inset-0" onPress={onClose} />
        {children}
        <View className="absolute right-5 top-16 flex-row items-center gap-5">
          {onSave ? <SaveButton onPress={onSave} size={22} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={8}>
            <Icon name="close" size={28} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
