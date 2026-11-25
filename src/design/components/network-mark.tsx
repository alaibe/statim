import { Text as RNText, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import type { NetworkId } from "@/core/messaging/networks";

import { NETWORK_MARKS } from "../network-marks";
import { textStyle } from "./text";

/** A network mark on a square keeps the avatar page's `sm` corner. */
export const squareCorner = (_size: number) => 2;

export function NetworkMark({
  network,
  label,
  size = 16,
  square = false,
}: {
  network: NetworkId;
  label: string;
  size?: number;
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
        backgroundColor: mark?.color ?? "#6B7280",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {mark?.path ? (
        <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
          <Path d={mark.path} fill="#FFFFFF" />
        </Svg>
      ) : (
        <RNText
          style={[
            textStyle("control", { strong: true }),
            { fontSize: size * 0.6, lineHeight: size * 0.75, color: "#FFFFFF" },
          ]}
        >
          {mark?.glyph ?? label.slice(0, 1).toUpperCase()}
        </RNText>
      )}
    </View>
  );
}
