import { View } from "react-native";

import { PrimaryScope } from "../lib/primary";
import { Layout } from "../tokens";
import type { ScreenProps } from "./screen";

export type { ScreenProps } from "./screen";

/** The detail region: no notch, the text column at most 680 wide. */
export function Screen({ children, edges: _edges, style, ...props }: ScreenProps) {
  return (
    <View style={{ flex: 1 }}>
      <PrimaryScope>
        <View style={[{ flex: 1, width: "100%", maxWidth: Layout.reading, alignSelf: "center" }, style]} {...props}>
          {children}
        </View>
      </PrimaryScope>
    </View>
  );
}
