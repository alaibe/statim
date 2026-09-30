import LottieView, { type AnimationObject } from 'lottie-react-native';

export interface StickerAnimationProps {
  animation: AnimationObject;
  width: number;
  height: number;
}

export function StickerAnimation({ animation, width, height }: StickerAnimationProps) {
  return <LottieView source={animation} autoPlay loop style={{ width, height }} />;
}
