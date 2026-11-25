import { useState } from "react";
import { View } from "react-native";

import { Button, Menu, Pressable, Tag, type TagTone, Text, type TextTone } from "../components";
import { copyText } from "../copy-text";
import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon } from "../icon";
import { Radius, Size } from "../tokens";
import { affordanceFor } from "./affordance";
import { FormWidget } from "./form-widget";
import type { Widget, WidgetAction, WidgetOf, WidgetTone } from "./schema";

interface WidgetViewProps {
  widget: Widget;
  onCommand?: (command: string) => void;
  onOpenUrl?: (url: string) => void;
  onOffer?: (heading: { title: string; subtitle?: string }, actions: WidgetAction[]) => void;
}

const TEXT_TONE: Record<WidgetTone, TextTone> = {
  neutral: "fg",
  brand: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
};

const TAG_TONE: Record<WidgetTone, TagTone> = {
  neutral: "category",
  brand: "accent",
  success: "ok",
  warning: "warn",
  danger: "err",
};

const BAR = { brand: "accent", success: "success", warning: "warning", danger: "danger" } as const;

export function WidgetView(props: WidgetViewProps) {
  const [offer, setOffer] = useState<{
    title: string;
    subtitle?: string;
    actions: WidgetAction[];
  } | null>(null);

  return (
    <>
      <WidgetNode
        {...props}
        onOffer={(heading, actions) => {
          if (actions.length === 1 && actions[0].tone !== "danger") {
            props.onCommand?.(actions[0].command);
            return;
          }
          setOffer({ ...heading, actions });
        }}
      />

      {offer ? (
        <Menu
          visible
          onClose={() => setOffer(null)}
          title={offer.title}
          subtitle={offer.subtitle}
          items={offer.actions.map((action) => ({
            label: action.label,
            icon: action.icon,
            danger: action.tone === "danger",
            onPress: () => props.onCommand?.(action.command),
          }))}
        />
      ) : null}
    </>
  );
}

function Affordance({ actions }: { actions: WidgetAction[] | undefined }) {
  const label = affordanceFor(actions);
  if (!label || !actions?.length) return null;

  const first = actions[0];
  if (first.icon) return <Icon name={first.icon} size={16} tone={first.tone === "danger" ? "danger" : "muted"} />;

  const single = actions.length === 1 ? actions[0] : undefined;
  return (
    <Text variant="control" tone={single?.tone === "danger" ? "danger" : "muted"} numberOfLines={1}>
      {label}
    </Text>
  );
}

function Offerable({
  actions,
  heading,
  label,
  onOffer,
  children,
}: {
  actions: WidgetAction[] | undefined;
  heading: { title: string; subtitle?: string };
  label?: string;
  onOffer: WidgetViewProps["onOffer"];
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  if (!actions?.length) return children;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={affordanceFor(actions) ?? undefined}
      onPress={() => onOffer?.(heading, actions)}
      style={({ hovered, pressed }) => ({
        marginHorizontal: -4,
        paddingHorizontal: 4,
        borderRadius: Radius.sm,
        backgroundColor: hovered || pressed ? colors.hover : "transparent",
      })}
    >
      {children}
    </Pressable>
  );
}

/** On or off, said by the row's label as well: never colour alone. */
function StateDot({ state }: { state: "on" | "off" }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        width: Size.dot,
        height: Size.dot,
        borderRadius: Radius.full,
        backgroundColor: state === "on" ? colors.success : colors["line-strong"],
      }}
    />
  );
}

function WidgetNode({ widget, onCommand, onOpenUrl, onOffer }: WidgetViewProps) {
  switch (widget.kind) {
    case "stat":
      return <StatWidget widget={widget} onOffer={onOffer} />;

    case "rows":
      return <RowsWidget widget={widget} onOffer={onOffer} />;

    case "list":
      return <ListWidget widget={widget} onOffer={onOffer} />;

    case "text":
      return <Text>{widget.text}</Text>;

    case "code":
      return <CodeWidget widget={widget} />;

    case "card":
      return <CardWidget widget={widget} onCommand={onCommand} onOpenUrl={onOpenUrl} onOffer={onOffer} />;

    case "badges":
      return (
        <View className="flex-row flex-wrap gap-1">
          {widget.badges.map((b, i) => (
            <Tag key={`${b.label}-${i}`} label={b.label} tone={TAG_TONE[b.tone ?? "neutral"]} />
          ))}
        </View>
      );

    case "actions":
      return (
        <View className="flex-row flex-wrap gap-2">
          {widget.actions.map((action, i) => (
            <Button
              key={`${action.label}-${i}`}
              label={action.label}
              icon={action.icon}
              size="sm"
              variant={action.tone === "danger" ? "danger" : "secondary"}
              onPress={() => onCommand?.(action.command)}
            />
          ))}
        </View>
      );

    case "form":
      return <FormWidget widget={widget} onCommand={onCommand} />;

    case "link":
      return (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={widget.label}
          onPress={() => onOpenUrl?.(widget.url)}
          className="flex-row items-center gap-2"
        >
          <Text tone="accent" numberOfLines={1} className="min-w-0 shrink">
            {widget.label}
          </Text>
          <Icon name={widget.icon ?? "arrow-up-right"} size={16} tone="accent" />
        </Pressable>
      );
  }
}

interface OfferingWidgetProps<K extends Widget["kind"]> {
  widget: WidgetOf<K>;
  onOffer: WidgetViewProps["onOffer"];
}

function StatWidget({ widget, onOffer }: OfferingWidgetProps<"stat">) {
  return (
    <Offerable
      actions={widget.actions}
      heading={widget.label ? { title: widget.label, subtitle: widget.value } : { title: widget.value }}
      onOffer={onOffer}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 gap-1">
          {widget.label ? <Text variant="label">{widget.label}</Text> : null}
          <Text variant="stat" tone={TEXT_TONE[widget.tone ?? "neutral"]}>
            {widget.value}
          </Text>
          {widget.caption ? <Text variant="meta">{widget.caption}</Text> : null}
        </View>
        <Affordance actions={widget.actions} />
      </View>
    </Offerable>
  );
}

function RowsWidget({ widget, onOffer }: OfferingWidgetProps<"rows">) {
  return (
    <View className="gap-1">
      {widget.rows.map((row, i) => (
        <Offerable
          key={`${row.label}-${i}`}
          actions={row.actions}
          heading={{ title: row.label, subtitle: row.value || undefined }}
          label={`${row.label}, ${row.value}`}
          onOffer={onOffer}
        >
          <View className={row.state ? "flex-row items-center gap-3 py-1" : "flex-row items-baseline gap-3 py-1"}>
            {row.state ? <StateDot state={row.state} /> : null}
            <Text size="sm" tone="muted" className={row.state ? "shrink grow" : "shrink-0"} numberOfLines={1}>
              {row.label}
            </Text>
            {row.value ? (
              <Text
                variant="code"
                align="right"
                tone={TEXT_TONE[row.tone ?? "neutral"]}
                numberOfLines={1}
                className="shrink grow"
              >
                {row.value}
              </Text>
            ) : null}
            <View className="pl-2">
              <Affordance actions={row.actions} />
            </View>
          </View>
        </Offerable>
      ))}
    </View>
  );
}

function ListWidget({ widget, onOffer }: OfferingWidgetProps<"list">) {
  return (
    <View>
      {widget.items.map((item, i) => (
        <Offerable
          key={`${item.title}-${i}`}
          actions={item.actions}
          heading={{ title: item.title, subtitle: item.subtitle }}
          label={item.subtitle ? `${item.title}, ${item.subtitle}` : item.title}
          onOffer={onOffer}
        >
          <View className="flex-row items-center gap-2 py-2">
            {item.state ? <StateDot state={item.state} /> : null}
            {item.icon ? <Icon name={item.icon} size={16} tone="muted" /> : null}
            <View className="min-w-0 shrink grow gap-1">
              <Text numberOfLines={1} tone={TEXT_TONE[item.tone ?? "neutral"]}>
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text size="sm" tone="muted" numberOfLines={2}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            {item.status ? <Tag label={item.status} tone={TAG_TONE[item.tone ?? "neutral"]} /> : null}
            <View className="pl-2">
              <Affordance actions={item.actions} />
            </View>
          </View>
        </Offerable>
      ))}
    </View>
  );
}

function CodeWidget({ widget }: { widget: WidgetOf<"code"> }) {
  const body = (
    <View className="gap-1">
      {widget.label ? <Text variant="label">{widget.label}</Text> : null}
      <View className="flex-row items-center gap-2">
        <Text variant="code" numberOfLines={1} className="flex-1">
          {widget.value}
        </Text>
        {widget.copyable ? <Icon name="copy" size={16} tone="muted" /> : null}
      </View>
    </View>
  );

  if (!widget.copyable) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy ${widget.label ?? "value"}`}
      onPress={() => void copyText(widget.value)}
    >
      {body}
    </Pressable>
  );
}

/** A raised panel; a tone draws the notice's 2px bar on its left edge, never a tinted fill. */
function CardWidget({ widget, onCommand, onOpenUrl, onOffer }: WidgetViewProps & { widget: WidgetOf<"card"> }) {
  const colors = useThemeColors();
  const tone = widget.tone && widget.tone !== "neutral" ? colors[BAR[widget.tone]] : null;
  return (
    <View
      className="gap-3 p-3"
      style={{
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: Radius.lg,
        boxShadow: tone ? `inset 2px 0 0 ${tone}` : undefined,
      }}
    >
      {widget.title ? (
        <View className="flex-row items-center gap-2">
          {widget.icon ? <Icon name={widget.icon} size={16} tone="muted" /> : null}
          <Text variant="label">{widget.title}</Text>
        </View>
      ) : null}
      {widget.children.map((child, i) => (
        <WidgetNode key={i} widget={child} onCommand={onCommand} onOpenUrl={onOpenUrl} onOffer={onOffer} />
      ))}
    </View>
  );
}
