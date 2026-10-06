import { useEffect, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  return (
    <View className="rounded-card bg-white p-4">
      <QRCode value={value} size={size} backgroundColor="#ffffff" color="#000000" />
    </View>
  );
}

/** Cycles through the frames of a payload too big for one code. */
export function AnimatedQrCode({ parts, size = 220 }: { parts: string[]; size?: number }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (parts.length < 2) return;
    const timer = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(timer);
  }, [parts.length]);

  return (
    <View>
      {parts.map((part, i) => (
        <View key={part} style={i === tick % parts.length ? undefined : HIDDEN}>
          <QrCode value={part.toUpperCase()} size={size} />
        </View>
      ))}
    </View>
  );
}

const HIDDEN = { position: 'absolute', opacity: 0 } as const;
