import type { AnimationItem } from 'lottie-web';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import type { StickerAnimationProps } from './sticker-animation';

/** The message list keeps every loaded row mounted, so a sticker only plays while it is in view. */
export function StickerAnimation({ animation, width, height }: StickerAnimationProps) {
  const box = useRef<View>(null);

  useEffect(() => {
    const container = box.current as unknown as HTMLElement | null;
    if (!container) return;
    let player: Promise<AnimationItem> | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.at(-1)?.isIntersecting) {
        void player?.then((loaded) => loaded.pause());
        return;
      }
      player ??= import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
        const loaded = lottie.loadAnimation({
          container,
          animationData: animation,
          renderer: 'svg',
          loop: true,
          autoplay: false,
        });
        loaded.setSubframe(false);
        return loaded;
      });
      void player.then((loaded) => loaded.play());
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      void player?.then((loaded) => loaded.destroy());
    };
  }, [animation]);

  return <View ref={box} style={{ width, height }} />;
}
