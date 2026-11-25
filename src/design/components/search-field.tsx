import { TextInput, type TextInputProps, View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon } from "../icon";
import { cn } from "../lib/cn";
import { IconButton } from "./icon-button";

export interface SearchFieldProps extends TextInputProps {
  /** The pill around the input; sizing and background go here. */
  className?: string;
  onClear?(): void;
}

export function SearchField({ className, onClear, value, ...input }: SearchFieldProps) {
  const colors = useThemeColors();

  return (
    <View className={cn("h-9 flex-row items-center gap-2 rounded-full bg-side px-3", className)}>
      <Icon name="search" size={16} tone="subtle" />
      <TextInput
        placeholderTextColor={colors.subtle}
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        className="flex-1 py-1 text-md text-fg"
        {...input}
      />
      {onClear && value ? <IconButton icon="circle-x" label="Clear search" size={16} onPress={onClear} /> : null}
    </View>
  );
}
