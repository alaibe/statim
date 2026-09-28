import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { NetworkId } from '@/core/messaging/networks';

import { NETWORK_MARKS } from '../network-marks';
import { Text } from './text';

export function NetworkMark({
  network,
  label,
  size = 16,
}: {
  network: NetworkId;
  label: string;
  size?: number;
}) {
  const mark = NETWORK_MARKS[network];
  const glyph = Math.round(size * 0.62);
  return (
    <View
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: mark?.color ?? '#6B7280',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {mark?.path ? (
        <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
          <Path d={mark.path} fill="#FFFFFF" />
        </Svg>
      ) : (
        <Text
          style={{ fontSize: size * 0.6, lineHeight: size * 0.75, color: '#FFFFFF' }}
          className="font-bold">
          {mark?.glyph ?? label.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
