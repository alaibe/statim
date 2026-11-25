import { TextInput, type TextInputProps, View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { cn } from "../lib/cn";
import { ErrorText } from "./error-text";
import { Text } from "./text";

interface FieldProps extends TextInputProps {
  ref?: React.Ref<TextInput>;
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  containerClassName?: string;
}

export const FIELD_BOX = "min-h-touch rounded-md border bg-panel px-3 py-2.5";

export function FieldShell({
  label,
  hint,
  error,
  containerClassName,
  children,
}: Pick<FieldProps, "label" | "hint" | "error" | "containerClassName"> & {
  children: React.ReactNode;
}) {
  return (
    <View className={cn("gap-1.5", containerClassName)}>
      {label ? <Text variant="footnote">{label}</Text> : null}
      {children}
      {error ? <ErrorText>{error}</ErrorText> : hint ? <Text variant="caption">{hint}</Text> : null}
    </View>
  );
}

export function Field({ label, hint, error, className, containerClassName, ...props }: FieldProps) {
  const colors = useThemeColors();

  return (
    <FieldShell label={label} hint={hint} error={error} containerClassName={containerClassName}>
      <TextInput
        placeholderTextColor={colors.subtle}
        style={{ borderCurve: "continuous" }}
        className={cn(
          FIELD_BOX,
          "text-md text-fg",
          error ? "border-danger" : "border-line focus:border-accent",
          className,
        )}
        {...props}
      />
    </FieldShell>
  );
}
