import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable as RNPressable, View, useWindowDimensions } from 'react-native';
import { Icon, Pressable } from '@/design';
import { MessageText } from '../message-text';
import { HoverSave, SaveButton } from './save-button';

export interface ImageBubbleProps {
  uri: string;
  width?: number;
  height?: number;
  caption?: string;
  fromMe: boolean;
  onSave?: () => void;
}

const MAX_WIDTH_RATIO = 0.62;
const MAX_HEIGHT = 320;

export function ImageBubble({ uri, width, height, caption, fromMe, onSave }: ImageBubbleProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [zoomed, setZoomed] = useState(false);

  const ratio = width && height ? width / height : 4 / 3;
  const boxWidth = Math.min(screenWidth * MAX_WIDTH_RATIO, 260);
  const boxHeight = Math.min(boxWidth / ratio, MAX_HEIGHT);

  return (
    <View className="gap-1.5">
      <HoverSave onSave={onSave}>
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={caption ?? 'Photo'}
          onPress={() => setZoomed(true)}
          pressScale={0.99}>
          <Image
            source={{ uri }}
            recyclingKey={uri}
            style={{ width: boxWidth, height: boxHeight, borderRadius: 14 }}
            contentFit="cover"
            transition={120}
            placeholderContentFit="cover"
          />
        </Pressable>
      </HoverSave>

      {caption ? (
        <MessageText
          text={caption}
          fromMe={fromMe}
          className={fromMe ? 'text-bubble-out-on' : 'text-bubble-in-on'}
        />
      ) : null}

      <Modal
        visible={zoomed}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomed(false)}>
        <RNPressable
          className="flex-1 items-center justify-center bg-black"
          onPress={() => setZoomed(false)}>
          <Image source={{ uri }} style={{ width: '100%', height: '80%' }} contentFit="contain" />
          <View className="absolute right-5 top-16 flex-row items-center gap-5">
            {onSave ? <SaveButton onPress={onSave} size={22} /> : null}
            <Icon name="close" size={28} color="#fff" />
          </View>
        </RNPressable>
      </Modal>
    </View>
  );
}
