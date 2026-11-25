import { useState } from "react";
import { Text as RNText, TextInput, type TextInputProps, View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon } from "../icon";
import { controlHeight, desktop } from "../lib/platform";
import { FontSize, focusRing, Radius, Space } from "../tokens";
import { IconButton } from "./button";
import { Keycap } from "./keycap";
import { Tag } from "./tag";
import { Text, textStyle } from "./text";

/** Up to three words, a label is the mono label role; longer ones stay in sentence case, mono `xs` 500. */
export function FieldLabel({ children }: { children: string }) {
  const colors = useThemeColors();
  if (children.trim().split(/\s+/).length <= 3) return <Text variant="label">{children}</Text>;
  return <RNText style={[LONG_LABEL, { color: colors.muted }]}>{children}</RNText>;
}

const LONG_LABEL = { ...textStyle("control"), fontSize: FontSize.xs, lineHeight: Math.round(FontSize.xs * 1.35) };

export interface FieldProps {
  label?: string;
  /** One line under the control in `muted`. */
  help?: string;
  /** Says what is wrong and how to fix it; starts with the ERR tag. */
  error?: string | null;
}

/** A label above, the control, and a help or error line under it. */
export function FieldShell({ label, help, error, children }: FieldProps & { children: React.ReactNode }) {
  return (
    <View style={{ gap: Space[2] }}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {children}
      {error ? <FieldError>{error}</FieldError> : help ? <FieldHelp>{help}</FieldHelp> : null}
    </View>
  );
}

export function FieldHelp({ children }: { children: string }) {
  return (
    <Text size="xs" tone="muted">
      {children}
    </Text>
  );
}

export function FieldError({ children }: { children: string }) {
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: Space[1] }}>
      <Tag tone="err" />
      <Text size="xs" tone="danger" style={{ flexShrink: 1 }}>
        {children}
      </Text>
    </View>
  );
}

export interface InputProps extends FieldProps, Omit<TextInputProps, "style" | "placeholderTextColor"> {
  ref?: React.Ref<TextInput>;
  /** Code, an amount, an address, an ID or a key. */
  mono?: boolean;
  testID?: string;
}

/** An input inside a control that draws the focus ring itself, so the input draws none. */
export const BARE = desktop ? { dataSet: { bare: "" } } : {};

/** The value's face and colour, for a `TextInput` drawn inside another control (the composer, the palette). */
export function useInputText(mono = false) {
  const colors = useThemeColors();
  return {
    style: [mono ? textStyle("code") : textStyle("body"), { color: colors.fg }],
    placeholderTextColor: colors.muted,
    selectionColor: colors.accent,
  };
}

/** `panel`, a `line-strong` border, radius `md`; `accent` and the ring on focus, `danger` on error. */
export function Input({
  label,
  help,
  error,
  mono = false,
  multiline,
  onFocus,
  onBlur,
  editable,
  ...props
}: InputProps) {
  const colors = useThemeColors();
  const text = useInputText(mono);
  const [focused, setFocused] = useState(false);
  const disabled = editable === false;

  return (
    <FieldShell label={label} help={help} error={error}>
      <TextInput
        accessibilityLabel={props.accessibilityLabel ?? label}
        aria-invalid={Boolean(error)}
        editable={editable}
        multiline={multiline}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={text.placeholderTextColor}
        selectionColor={text.selectionColor}
        style={[
          text.style,
          {
            minHeight: controlHeight(),
            maxHeight: multiline ? 12 * 24 + 16 : undefined,
            paddingHorizontal: Space[3],
            paddingVertical: multiline ? 8 : 0,
            textAlignVertical: multiline ? "top" : "center",
            borderRadius: Radius.md,
            borderWidth: 1,
            backgroundColor: disabled ? colors.bg : colors.panel,
            borderColor: error
              ? colors.danger
              : focused
                ? colors.accent
                : disabled
                  ? colors.line
                  : colors["line-strong"],
            color: disabled ? colors.subtle : colors.fg,
          },
          focused && !desktop ? { boxShadow: focusRing(colors) } : null,
        ]}
        {...props}
      />
    </FieldShell>
  );
}

export interface SearchFieldProps extends Omit<TextInputProps, "style" | "placeholderTextColor"> {
  ref?: React.Ref<TextInput>;
  onClear?(): void;
  /** The key that focuses it, shown inside on the right on the desktop: `/` or ⌘F. */
  shortcut?: string;
  testID?: string;
}

/** An input with Lucide `search` inside on the left, and its key (desktop) or a clear button (touch) on the right. */
export function SearchField({ onClear, shortcut, value, onFocus, onBlur, ...props }: SearchFieldProps) {
  const colors = useThemeColors();
  const text = useInputText();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        {
          height: controlHeight(),
          flexDirection: "row",
          alignItems: "center",
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: focused ? colors.accent : colors["line-strong"],
          backgroundColor: colors.panel,
        },
        focused ? { boxShadow: focusRing(colors) } : null,
      ]}
    >
      <View style={{ paddingLeft: Space[3], paddingRight: Space[2] }}>
        <Icon name="search" size={16} tone="muted" />
      </View>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={text.placeholderTextColor}
        selectionColor={text.selectionColor}
        {...(desktop ? { dataSet: { bare: "", search: "" } } : null)}
        style={[text.style, { flex: 1, height: "100%", paddingVertical: 0 }]}
        {...props}
      />
      {onClear && value ? (
        <IconButton icon="circle-x" label="Clear search" size="sm" onPress={onClear} />
      ) : shortcut && desktop && !focused ? (
        <View style={{ paddingRight: Space[2] }}>
          <Keycap label={shortcut} />
        </View>
      ) : null}
    </View>
  );
}
