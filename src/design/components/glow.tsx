import { View, type ViewStyle } from 'react-native';

import { cn } from '../lib/cn';

interface GlowProps {
  size: number;
  color: string;
  intensity?: number;
  className?: string;
  style?: ViewStyle;
}

const LAYERS = 16;

export function Glow({ size, color, intensity = 0.028, className, style }: GlowProps) {
  return (
    <View
      style={[{ width: size, height: size, pointerEvents: 'none' }, style]}
      className={cn('items-center justify-center', className)}>
      {Array.from({ length: LAYERS }, (_, i) => {
        const t = i / (LAYERS - 1);
        const diameter = size * (1 - Math.pow(t, 0.85) * 0.78);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              backgroundColor: color,
              opacity: intensity,
            }}
          />
        );
      })}
    </View>
  );
}
