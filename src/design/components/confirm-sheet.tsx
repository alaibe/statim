import { View } from "react-native";

import { type PressHandler, usePress } from "../lib/press";
import { Button } from "./button";
import { Sheet, type SheetProps } from "./sheet";
import { Text } from "./text";

export interface ConfirmSheetProps extends Omit<SheetProps, "children"> {
  body?: string | (string | undefined)[];
  confirm: {
    label: string;
    busyLabel?: string;
    tone?: "accent" | "danger";
    testID?: string;
    onPress: PressHandler;
  };
  cancelLabel?: string;
  busy?: boolean;
}

/** Cancel is `neutral`, never ghost: beside a destructive button the way out must not be the faintest thing. */
export function ConfirmSheet({
  body,
  confirm,
  cancelLabel = "Cancel",
  busy: working = false,
  ...sheet
}: ConfirmSheetProps) {
  const { pending, press } = usePress(confirm.onPress);
  const busy = working || pending;
  const paragraphs = (Array.isArray(body) ? body : [body]).filter(Boolean) as string[];

  return (
    <Sheet {...sheet}>
      {paragraphs.length > 0 ? (
        <View className="gap-2">
          {paragraphs.map((paragraph) => (
            <Text key={paragraph} variant="footnote">
              {paragraph}
            </Text>
          ))}
        </View>
      ) : null}
      <View className="gap-2 pt-1">
        <Button
          testID={confirm.testID}
          label={busy ? (confirm.busyLabel ?? confirm.label) : confirm.label}
          tone={confirm.tone ?? "accent"}
          fullWidth
          loading={busy}
          disabled={busy}
          onPress={press}
        />
        <Button label={cancelLabel} tone="neutral" fullWidth disabled={busy} onPress={sheet.onClose} />
      </View>
    </Sheet>
  );
}
