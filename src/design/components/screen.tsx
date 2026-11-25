import type { ViewProps } from "react-native";
import { View } from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";

import { useThemeColors } from "../hooks/use-theme-colors";
import { PrimaryScope } from "../lib/primary";
import { Layout } from "../tokens";

export interface ScreenProps extends ViewProps {
  /** Layout only: padding and gaps of the content column. */
  className?: string;
  edges?: readonly Edge[];
}

/** A screen on `bg`, its text column at most 680 wide, with room for one primary button. */
export function Screen({ children, edges = ["top"], style, ...props }: ScreenProps) {
  const colors = useThemeColors();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.bg }}>
      <PrimaryScope>
        <View style={[{ flex: 1, width: "100%", maxWidth: Layout.reading, alignSelf: "center" }, style]} {...props}>
          {children}
        </View>
      </PrimaryScope>
    </SafeAreaView>
  );
}
