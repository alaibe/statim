import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  return (
    <View className="rounded-card bg-white p-4">
      <QRCode value={value} size={size} backgroundColor="#ffffff" color="#000000" />
    </View>
  );
}
