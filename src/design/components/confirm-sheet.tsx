import { View } from 'react-native';

import { type PressHandler, usePress } from '../lib/press';
import { Button } from './button';
import { Sheet, type SheetProps } from './sheet';
import { Text } from './text';

export interface ConfirmSheetProps extends Omit<SheetProps, 'children'> {
  /** One paragraph, or several. Each becomes its own line of body copy. */
  body?: string | (string | undefined)[];
  confirm: {
    label: string;
    busyLabel?: string;
    /** `danger` for anything that destroys something. */
    tone?: 'brand' | 'danger';
    testID?: string;
    onPress: PressHandler;
  };
  cancelLabel?: string;
  /** Disables both buttons and puts the confirm button in its loading state. */
  busy?: boolean;
}

/**
 * Cancel is `neutral`, never ghost: beside a button that destroys something, the safe way out
 * should not be the faintest thing on screen.
 */
export function ConfirmSheet({
  body,
  confirm,
  cancelLabel = 'Cancel',
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
          tone={confirm.tone ?? 'brand'}
          fullWidth
          loading={busy}
          disabled={busy}
          onPress={press}
        />
        <Button
          label={cancelLabel}
          tone="neutral"
          fullWidth
          disabled={busy}
          onPress={sheet.onClose}
        />
      </View>
    </Sheet>
  );
}
