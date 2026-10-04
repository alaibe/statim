import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { NetworkId } from '@/core/messaging/networks';

import { NETWORK_MARKS } from '../network-marks';
import { Text } from './text';

export const squareCorner = (size: number) => size * 0.28;

export function NetworkMark({
  network,
  label,
  size = 16,
  square = false,
}: {
  network: NetworkId;
  label: string;
  size?: number;
  /** A folder's mark, set apart from a chat's round avatar. */
  square?: boolean;
}) {
  const mark = NETWORK_MARKS[network];
  const glyph = Math.round(size * 0.62);
  return (
    <View
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: square ? squareCorner(size) : size / 2,
        borderCurve: 'continuous',
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
