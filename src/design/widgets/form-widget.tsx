import { useState } from "react";
import { View } from "react-native";

import { Button, FieldShell, Input, MANY_OPTIONS, Menu, Pressable, Radio, Segmented, Text } from "../components";
import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon } from "../icon";
import { controlHeight } from "../lib/platform";
import { Radius, Space } from "../tokens";
import {
  displayValues,
  fillCommand,
  fillText,
  normaliseDecimal,
  resolveValues,
  visibleOptions,
  type WidgetOf,
  type WidgetOption,
} from "./schema";

const DECIMAL_SEPARATOR = new Intl.NumberFormat().format(1.5).charAt(1);

/** Up to four short options read as a segmented control; more as radios. */
const SEGMENTS = 4;

function SelectField({
  label,
  help,
  placeholder,
  options,
  value,
  onPick,
}: {
  label: string;
  help?: string;
  placeholder?: string;
  options: WidgetOption[];
  value: string | undefined;
  onPick: (value: string) => void;
}) {
  const colors = useThemeColors();
  const [picking, setPicking] = useState(false);
  const chosen = options.find((option) => option.value === value);

  return (
    <FieldShell label={label} help={help}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${chosen?.label ?? "none chosen"}`}
        onPress={() => setPicking(true)}
        style={({ hovered }) => ({
          height: controlHeight(),
          flexDirection: "row",
          alignItems: "center",
          gap: Space[2],
          paddingHorizontal: Space[3],
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: hovered ? colors.muted : colors["line-strong"],
          backgroundColor: colors.panel,
        })}
      >
        <Text tone={chosen ? "fg" : "muted"} numberOfLines={1} className="min-w-0 flex-1">
          {chosen?.label ?? placeholder ?? "Choose"}
        </Text>
        <Icon name="chevron-down" size={16} tone="muted" />
      </Pressable>

      <Menu
        visible={picking}
        onClose={() => setPicking(false)}
        title={label}
        searchFor={label.toLowerCase()}
        items={
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

function RadioField({
  label,
  help,
  options,
  value,
  onPick,
}: {
  label: string;
  help?: string;
  options: WidgetOption[];
  value: string | undefined;
  onPick: (value: string) => void;
}) {
  return (
    <FieldShell label={label} help={help}>
      <View accessibilityRole="radiogroup">
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === option.value }}
            accessibilityLabel={option.label}
            onPress={() => onPick(option.value)}
            className="min-h-touch flex-row items-center gap-2"
          >
            <Radio checked={value === option.value} />
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </FieldShell>
  );
}

export function FormWidget({ widget, onCommand }: { widget: WidgetOf<"form">; onCommand?: (command: string) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(widget.fields.map((f) => [f.id, f.value ?? ""])),
  );

  const answers = resolveValues(widget.fields, values);
  const display = displayValues(widget.fields, answers);
  const missing = widget.fields.some((f) => !f.optional && !answers[f.id]?.trim());
  const fill = (text: string | undefined) => (text ? fillText(text, display) : undefined);
  const answer = (id: string, value: string) => setValues({ ...answers, [id]: value });

  return (
    <View className="gap-4" style={{ minWidth: 260 }}>
      {widget.fields.map((field) => {
        const label = fillText(field.label, display);
        if (!field.options) {
          return (
            <Input
              key={field.id}
              label={label}
              help={fill(field.hint)}
              mono={field.keyboard === "decimal"}
              placeholder={fill(field.placeholder)}
              defaultValue={field.value ?? ""}
              onChangeText={(text: string) =>
                answer(field.id, field.keyboard === "decimal" ? normaliseDecimal(text, DECIMAL_SEPARATOR) : text)
              }
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType={field.keyboard === "decimal" ? "decimal-pad" : "default"}
            />
          );
        }
        const options = visibleOptions(field, answers);
        if (field.select || options.length >= MANY_OPTIONS) {
          return (
            <SelectField
              key={field.id}
              label={label}
              help={fill(field.hint)}
              placeholder={field.placeholder}
              options={options}
              value={answers[field.id]}
              onPick={(value) => answer(field.id, value)}
            />
          );
        }
        if (options.length > SEGMENTS) {
          return (
            <RadioField
              key={field.id}
              label={label}
              help={fill(field.hint)}
              options={options}
              value={answers[field.id]}
              onPick={(value) => answer(field.id, value)}
            />
          );
        }
        return (
          <FieldShell key={field.id} label={label} help={fill(field.hint)}>
            <Segmented
              accessibilityLabel={label}
              options={options.map((option) => ({ value: option.value, label: option.label }))}
              value={answers[field.id] ?? ""}
              onChange={(value) => answer(field.id, value)}
            />
          </FieldShell>
        );
      })}
      <Button
        label={widget.submit.label}
        size="sm"
        disabled={missing}
        variant={widget.submit.tone === "danger" ? "danger" : "secondary"}
        onPress={() => onCommand?.(fillCommand(widget.submit.command, answers))}
      />
    </View>
  );
}
