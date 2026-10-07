import { useState } from 'react';
import { View } from 'react-native';

import {
  ActionSheet,
  Button,
  Chip,
  Field,
  FieldShell,
  FIELD_BOX,
  MANY_OPTIONS,
  Pressable,
  Text,
} from '../components';
import { Icon } from '../icon';
import { cn } from '../lib/cn';
import {
  displayValues,
  fillCommand,
  fillText,
  normaliseDecimal,
  resolveValues,
  visibleOptions,
  type WidgetOf,
  type WidgetOption,
} from './schema';

const DECIMAL_SEPARATOR = new Intl.NumberFormat().format(1.5).charAt(1);

function SelectField({
  label,
  hint,
  placeholder,
  options,
  value,
  onPick,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  options: WidgetOption[];
  value: string | undefined;
  onPick: (value: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const chosen = options.find((option) => option.value === value);

  return (
    <FieldShell label={label} hint={hint}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${chosen?.label ?? 'none chosen'}`}
        onPress={() => setPicking(true)}
        style={{ borderCurve: 'continuous' }}
        className={cn(FIELD_BOX, 'flex-row items-center gap-2 border-line')}>
        <Text
          className={cn(
            'min-w-0 flex-1 text-body',
            chosen ? 'text-content' : 'text-content-subtle'
          )}>
          {chosen?.label ?? placeholder ?? 'Choose'}
        </Text>
        <Icon name="chevron-down" size={16} tone="subtle" />
      </Pressable>

      <ActionSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={label}
        searchFor={label.toLowerCase()}
        actions={
          picking
            ? options.map((option) => ({
                label: option.label,
                selected: option.value === value,
                onPress: () => onPick(option.value),
              }))
            : []
        }
      />
    </FieldShell>
  );
}

export function FormWidget({
  widget,
  onCommand,
}: {
  widget: WidgetOf<'form'>;
  onCommand?: (command: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(widget.fields.map((f) => [f.id, f.value ?? '']))
  );

  const answers = resolveValues(widget.fields, values);
  const display = displayValues(widget.fields, answers);
  const missing = widget.fields.some((f) => !f.optional && !answers[f.id]?.trim());
  const fill = (text: string | undefined) => (text ? fillText(text, display) : undefined);
  const answer = (id: string, value: string) => setValues({ ...answers, [id]: value });

  return (
    <View className="gap-3" style={{ minWidth: 260 }}>
      {widget.fields.map((field) => {
        const label = fillText(field.label, display);
        if (!field.options) {
          return (
            <Field
              key={field.id}
              label={label}
              hint={fill(field.hint)}
              placeholder={fill(field.placeholder)}
              defaultValue={field.value ?? ''}
              onChangeText={(text) =>
                answer(
                  field.id,
                  field.keyboard === 'decimal' ? normaliseDecimal(text, DECIMAL_SEPARATOR) : text
                )
              }
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType={field.keyboard === 'decimal' ? 'decimal-pad' : 'default'}
            />
          );
        }
        const options = visibleOptions(field, answers);
        if (field.select || options.length >= MANY_OPTIONS) {
          return (
            <SelectField
              key={field.id}
              label={label}
              hint={fill(field.hint)}
              placeholder={field.placeholder}
              options={options}
              value={answers[field.id]}
              onPick={(value) => answer(field.id, value)}
            />
          );
        }
        return (
          <View key={field.id} className="gap-1.5">
            <Text variant="caption">{label}</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {options.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  size="sm"
                  selected={answers[field.id] === option.value}
                  onPress={() => answer(field.id, option.value)}
                />
              ))}
            </View>
            {field.hint ? <Text variant="micro">{fill(field.hint)}</Text> : null}
          </View>
        );
      })}
      <Button
        label={widget.submit.label}
        size="sm"
        disabled={missing}
        tone={widget.submit.tone}
        onPress={() => onCommand?.(fillCommand(widget.submit.command, answers))}
      />
    </View>
  );
}
