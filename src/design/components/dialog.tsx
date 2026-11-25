import { useState } from "react";
import { View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { type PressHandler, usePress } from "../lib/press";
import { PrimaryScope } from "../lib/primary";
import { Chamfer as ChamferSize, Layout, Radius, Shadow, Space, withAlpha } from "../tokens";
import { Button } from "./button";
import { Chamfer } from "./chamfer";
import { Input } from "./input";
import { Sheet, type SheetProps } from "./sheet";
import { Text } from "./text";

/** The modal surface: `panel`, a `line-strong` edge, radius `xl`, the top-left chamfer and `--shadow-dialog`. */
export function DialogSurface({
  width = "dialog",
  children,
}: {
  width?: "dialog" | "dialog-form" | "palette";
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  const palette = width === "palette";
  return (
    <View
      onStartShouldSetResponder={() => true}
      style={{
        width: Layout[width],
        maxWidth: "100%",
        maxHeight: "100%",
        borderRadius: palette ? Radius.lg : Radius.xl,
        boxShadow: Shadow.dialog,
      }}
    >
      <Chamfer
        corner="top-left"
        cut={ChamferSize.md}
        radius={palette ? Radius.lg : Radius.xl}
        fill={colors.panel}
        stroke={colors["line-strong"]}
      />
      <PrimaryScope>
        <View style={{ padding: 1, flexShrink: 1 }}>{children}</View>
      </PrimaryScope>
    </View>
  );
}

/** Behind a dialog: `void` at 70%; behind the palette, at 50%. */
export function scrimColor(colors: ReturnType<typeof useThemeColors>, palette = false) {
  return withAlpha(colors.void, palette ? 0.5 : 0.7);
}

/** An optional label, the title in mono `xl` 600; 20 20 8. */
export function DialogHeader({ label, title }: { label?: string; title: string }) {
  return (
    <View style={{ gap: Space[1], paddingTop: Space[5], paddingHorizontal: Space[5], paddingBottom: Space[2] }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** Cancel, then the action, right-aligned, under the body. */
export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: Space[2],
        paddingTop: Space[2],
      }}
    >
      {children}
    </View>
  );
}

export interface ConfirmDialogProps extends Omit<SheetProps, "children" | "subtitle" | "leading"> {
  /** What it is about, above the title: `DELETE ACCOUNT`. */
  label?: string;
  body?: string | (string | undefined)[];
  confirm: {
    /** Names the consequence ("Delete 12 records"), never "OK". */
    label: string;
    busyLabel?: string;
    danger?: boolean;
    testID?: string;
    onPress: PressHandler;
  };
  cancelLabel?: string;
  busy?: boolean;
  /** Something that can't be undone asks for its name to be typed first. */
  typedName?: string;
  children?: React.ReactNode;
}

/** One decision: the body says what happens, Cancel then the action that names it; ⌘↵ confirms, Esc cancels. */
export function ConfirmDialog({
  label,
  body,
  confirm,
  cancelLabel = "Cancel",
  busy: working = false,
  typedName,
  children,
  ...sheet
}: ConfirmDialogProps) {
  const { pending, press } = usePress(confirm.onPress);
  const [typed, setTyped] = useState("");
  const busy = working || pending;
  const ready = !typedName || typed.trim() === typedName;
  const paragraphs = (Array.isArray(body) ? body : [body]).filter(Boolean) as string[];

  return (
    <Sheet {...sheet} label={label}>
      <View style={{ gap: Space[4] }}>
        {paragraphs.map((paragraph) => (
          <Text key={paragraph} tone="muted">
            {paragraph}
          </Text>
        ))}
        {children}
        {typedName ? (
          <Input
            label={`Type ${typedName} to confirm`}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}
      </View>
      <DialogFooter>
        <Button label={cancelLabel} disabled={busy} onPress={sheet.onClose} />
        <Button
          testID={confirm.testID}
          label={busy ? (confirm.busyLabel ?? confirm.label) : confirm.label}
          variant={confirm.danger ? "danger" : "primary"}
          confirm={confirm.danger}
          keys={["mod", "enter"]}
          busy={busy}
          disabled={!ready}
          onPress={press}
        />
      </DialogFooter>
    </Sheet>
  );
}
