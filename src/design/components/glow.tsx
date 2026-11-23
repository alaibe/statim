import { View } from "react-native";

interface GlowProps {
  size: number;
  color: string;
  intensity?: number;
}

const LAYERS = 16;

export function Glow({ size, color, intensity = 0.028 }: GlowProps) {
  return (
    <View style={{ width: size, height: size, pointerEvents: "none" }} className="items-center justify-center">
      {Array.from({ length: LAYERS }, (_, i) => {
        const t = i / (LAYERS - 1);
        const diameter = size * (1 - Math.pow(t, 0.85) * 0.78);
        return (
          <View
            key={i}
            style={{
              position: "absolute",
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
