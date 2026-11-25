import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

interface ChamferProps {
  /** The primary button's bottom-right cut, or the dialog's and palette's top-left one. */
  corner: "bottom-right" | "top-left";
  cut: number;
  radius: number;
  fill: string;
  stroke?: string;
}

function outline(width: number, height: number, corner: ChamferProps["corner"], cut: number, r: number, inset: number) {
  const [x0, y0, x1, y1] = [inset, inset, width - inset, height - inset];
  if (corner === "bottom-right") {
    return `M${x0 + r} ${y0} H${x1 - r} Q${x1} ${y0} ${x1} ${y0 + r} V${y1 - cut} L${x1 - cut} ${y1} H${x0 + r} Q${x0} ${y1} ${x0} ${y1 - r} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} Z`;
  }
  return `M${x0 + cut} ${y0} H${x1 - r} Q${x1} ${y0} ${x1} ${y0 + r} V${y1 - r} Q${x1} ${y1} ${x1 - r} ${y1} H${x0 + r} Q${x0} ${y1} ${x0} ${y1 - r} V${y0 + cut} Z`;
}

/** The cut is drawn on a layer behind the content, so it never clips the focus ring or the glow. */
export function Chamfer({ corner, cut, radius, fill, stroke }: ChamferProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const inset = stroke ? 0.5 : 0;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(event) => setSize(event.nativeEvent.layout)}>
      {size.width > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Path
            d={outline(size.width, size.height, corner, cut, radius, inset)}
            fill={fill}
            stroke={stroke}
            strokeWidth={stroke ? 1 : 0}
          />
        </Svg>
      ) : null}
    </View>
  );
}
