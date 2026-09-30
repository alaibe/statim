import { useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MediaPanelContent, type MediaPanelProps, type MediaTab } from './media-panel-content';

export type { MediaAnchor, MediaPanelProps } from './media-panel-content';

/** On a phone the panel rises from the bottom, where the keyboard would be. */
export function MediaPanel({
  chatId,
  tabs,
  tab: initialTab,
  onClose,
  onEmoji,
  onSend,
}: MediaPanelProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<MediaTab>(initialTab);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 bg-content/20" />
      <View
        style={{ height: Math.round(height * 0.55), paddingBottom: insets.bottom }}
        className="rounded-t-card bg-surface-raised">
        <MediaPanelContent
          chatId={chatId}
          tabs={tabs}
          tab={tab}
          onTab={setTab}
          onEmoji={onEmoji}
          onSend={onSend}
        />
      </View>
    </Modal>
  );
}
