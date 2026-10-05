import { View } from 'react-native';

import { useState } from 'react';

import { ActionSheet, Badge, Button, Eyebrow, Pressable, Text } from '../components';
import { Icon } from '../icon';
import { cn } from '../lib/cn';
import { copyText } from '../copy-text';
import { affordanceFor } from './affordance';
import { FormWidget } from './form-widget';
import { type Widget, type WidgetAction, type WidgetTone } from './schema';

export interface WidgetViewProps {
  widget: Widget;
  onCommand?: (command: string) => void;
  onOpenUrl?: (url: string) => void;
  onOffer?: (heading: { title: string; subtitle?: string }, actions: WidgetAction[]) => void;
}

const TEXT_TONE: Record<WidgetTone, string> = {
  neutral: 'text-content',
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const CARD_TONE: Record<WidgetTone, string> = {
  neutral: 'border-line bg-surface-raised',
  brand: 'border-brand/40 bg-brand-soft',
  success: 'border-success/40 bg-success/10',
  warning: 'border-warning/40 bg-warning/10',
  danger: 'border-danger/40 bg-danger/10',
};

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
          if (actions.length === 1 && actions[0].tone !== 'danger') {
            props.onCommand?.(actions[0].command);
            return;
          }
          setOffer({ ...heading, actions });
        }}
      />

      {offer ? (
        <ActionSheet
          visible
          onClose={() => setOffer(null)}
          title={offer.title}
          subtitle={offer.subtitle}
          actions={offer.actions.map((action) => ({
            label: action.label,
            icon: action.icon,
            tone: action.tone,
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

  const primary = actions[0];
  if (primary.icon) {
    return (
      <View className="h-7 w-7 items-center justify-center rounded-pill bg-surface-sunken">
        <Icon name={primary.icon} size={15} tone={primary.tone === 'danger' ? 'danger' : 'brand'} />
      </View>
    );
  }

  const single = actions.length === 1 ? actions[0] : undefined;

  return (
    <Text
      numberOfLines={1}
      className={cn(
        'shrink-0 text-footnote font-medium',
        single?.tone === 'danger' ? 'text-danger' : 'text-brand'
      )}>
      {label}
    </Text>
  );
}

function Offerable({
  actions,
  heading,
  label,
  className,
  onOffer,
  children,
}: {
  actions: WidgetAction[] | undefined;
  heading: { title: string; subtitle?: string };
  label?: string;
  className?: string;
  onOffer: WidgetViewProps['onOffer'];
  children: React.ReactNode;
}) {
  if (!actions?.length) return children;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={affordanceFor(actions) ?? undefined}
      pressScale={0.99}
      onPress={() => onOffer?.(heading, actions)}
      className={className}>
      {children}
    </Pressable>
  );
}

function StateDot({ state }: { state: 'on' | 'off' }) {
  return (
    <View
      className={cn(
        'h-2 w-2 shrink-0 rounded-pill',
        state === 'on' ? 'bg-success' : 'bg-content-subtle/40'
      )}
    />
  );
}

function WidgetNode({ widget, onCommand, onOpenUrl, onOffer }: WidgetViewProps) {
  switch (widget.kind) {
    case 'stat':
      return (
        <Offerable
          actions={widget.actions}
          heading={
            widget.label ? { title: widget.label, subtitle: widget.value } : { title: widget.value }
          }
          onOffer={onOffer}>
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1 gap-0.5">
              {widget.label ? <Text variant="caption">{widget.label}</Text> : null}
              <Text variant="amount" className={TEXT_TONE[widget.tone ?? 'neutral']}>
                {widget.value}
              </Text>
              {widget.caption ? <Text variant="caption">{widget.caption}</Text> : null}
            </View>
            <Affordance actions={widget.actions} />
          </View>
        </Offerable>
      );

    case 'rows':
      return (
        <View className="gap-1.5">
          {widget.rows.map((row, i) => (
            <Offerable
              key={`${row.label}-${i}`}
              actions={row.actions}
              heading={{ title: row.label, subtitle: row.value || undefined }}
              label={`${row.label}, ${row.value}`}
              className="-mx-1 rounded-field px-1 py-0.5 active:bg-surface-sunken"
              onOffer={onOffer}>
              <View className={cn('flex-row gap-3', row.state ? 'items-center' : 'items-baseline')}>
                {row.state ? <StateDot state={row.state} /> : null}
                <Text
                  variant="caption"
                  className={cn(row.state ? 'grow shrink' : 'shrink-0')}
                  numberOfLines={1}>
                  {row.label}
                </Text>
                {row.value ? (
                  <Text
                    numberOfLines={1}
                    className={cn(
                      'grow shrink text-right text-footnote font-medium tabular-nums',
                      TEXT_TONE[row.tone ?? 'neutral']
                    )}>
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

    case 'list':
      return (
        <View className="gap-1">
          {widget.items.map((item, i) => (
            <Offerable
              key={`${item.title}-${i}`}
              actions={item.actions}
              heading={{ title: item.title, subtitle: item.subtitle }}
              label={item.subtitle ? `${item.title}, ${item.subtitle}` : item.title}
              className="-mx-1.5 rounded-field px-1.5 active:bg-surface-sunken"
              onOffer={onOffer}>
              <View className="flex-row items-center gap-2.5 py-2">
                {item.state ? <StateDot state={item.state} /> : null}
                {item.icon ? <Icon name={item.icon} size={17} tone="muted" /> : null}
                <View className="min-w-0 grow shrink gap-0.5">
                  <Text
                    numberOfLines={1}
                    className={cn(
                      'text-footnote font-semibold',
                      TEXT_TONE[item.tone ?? 'neutral']
                    )}>
                    {item.title}
                  </Text>
                  {item.subtitle ? (
                    <Text variant="caption" numberOfLines={2}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
                {item.status ? (
                  <Badge label={item.status} tone={item.tone === 'brand' ? 'brand' : 'neutral'} />
                ) : null}
                <View className="pl-2">
                  <Affordance actions={item.actions} />
                </View>
              </View>
            </Offerable>
          ))}
        </View>
      );

    case 'text':
      return <Text variant="footnote">{widget.text}</Text>;

    case 'code': {
      const body = (
        <View className="gap-0.5">
          {widget.label ? <Text variant="caption">{widget.label}</Text> : null}
          <View className="flex-row items-center gap-1.5">
            <Text variant="mono" numberOfLines={1} className="flex-1">
              {widget.value}
            </Text>
            {widget.copyable ? <Icon name="copy-outline" size={13} tone="subtle" /> : null}
          </View>
        </View>
      );

      if (!widget.copyable) return body;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copy ${widget.label ?? 'value'}`}
          pressScale={0.99}
          onPress={() => void copyText(widget.value)}>
          {body}
        </Pressable>
      );
    }

    case 'card':
      return (
        <View
          className={cn(
            'gap-2.5 rounded-bubble border p-3.5',
            CARD_TONE[widget.tone ?? 'neutral']
          )}>
          {widget.title ? (
            <View className="flex-row items-center gap-1.5">
              {widget.icon ? (
                <Icon
                  name={widget.icon}
                  size={15}
                  tone={widget.tone === 'neutral' || !widget.tone ? 'muted' : 'brand'}
                />
              ) : null}
              <Eyebrow>{widget.title}</Eyebrow>
            </View>
          ) : null}
          {widget.children.map((child, i) => (
            <WidgetNode
              key={i}
              widget={child}
              onCommand={onCommand}
              onOpenUrl={onOpenUrl}
              onOffer={onOffer}
            />
          ))}
        </View>
      );

    case 'badges':
      return (
        <View className="flex-row flex-wrap gap-1.5">
          {widget.badges.map((b, i) => (
            <Badge key={`${b.label}-${i}`} label={b.label} tone={b.tone ?? 'neutral'} />
          ))}
        </View>
      );

    case 'actions':
      return (
        <View className="flex-row flex-wrap gap-2">
          {widget.actions.map((action, i) => (
            <Button
              key={`${action.label}-${i}`}
              label={action.label}
              size="sm"
              tone={action.tone}
              onPress={() => onCommand?.(action.command)}
            />
          ))}
        </View>
      );

    case 'form':
      return <FormWidget widget={widget} onCommand={onCommand} />;

    case 'link':
      return (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={widget.label}
          onPress={() => onOpenUrl?.(widget.url)}
          className="flex-row items-center gap-1.5">
          <Icon name={widget.icon ?? 'open-outline'} size={14} tone="brand" />
          <Text className="min-w-0 flex-1 text-footnote font-medium text-brand">
            {widget.label}
          </Text>
        </Pressable>
      );
  }
}
