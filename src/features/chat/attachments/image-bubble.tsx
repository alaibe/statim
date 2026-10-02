import { Image } from 'expo-image';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Pressable } from '@/design';
import { MessageText } from '../message-text';
import { MediaViewer } from './media-viewer';
import { HoverSave } from './save-button';

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

      <MediaViewer visible={zoomed} onClose={() => setZoomed(false)} onSave={onSave}>
        <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" />
      </MediaViewer>
    </View>
  );
}
