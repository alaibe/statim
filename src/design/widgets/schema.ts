/**
 * A widget is data, so it can be stored, summarised for the chat list, sent to another
 * participant and drawn by an app that lacks the plugin that made it. Keep the union additive: an
 * older build must skip a node it does not recognise without losing the message.
 */
import {
  arrayOf,
  isBoolean,
  isRecord,
  isString,
  oneOf,
  optional,
  shape,
  type Guard,
} from '@/lib/guards';

import type { IconName } from '../icon';

const WIDGET_TONES = ['neutral', 'brand', 'success', 'warning', 'danger'] as const;
const WIDGET_STATES = ['on', 'off'] as const;
const FIELD_KEYBOARDS = ['default', 'decimal'] as const;

export type WidgetTone = (typeof WIDGET_TONES)[number];
type WidgetState = (typeof WIDGET_STATES)[number];

export interface WidgetAction {
  label: string;
  command: string;
  tone?: WidgetTone;
  icon?: IconName;
}

export interface WidgetRow {
  label: string;
  value: string;
  tone?: WidgetTone;
  state?: WidgetState;
  actions?: WidgetAction[];
}

export interface WidgetListItem {
  title: string;
  subtitle?: string;
  icon?: IconName;
  tone?: WidgetTone;
  status?: string;
  state?: WidgetState;
  actions?: WidgetAction[];
}

export interface WidgetOption {
  label: string;
  value: string;
  when?: Record<string, string>;
}

export interface WidgetField {
  id: string;
  label: string;
  placeholder?: string;
  value?: string;
  keyboard?: (typeof FIELD_KEYBOARDS)[number];
  hint?: string;
  optional?: boolean;
  options?: WidgetOption[];
  /** Options behind a picker instead of a row of chips, for lists that grow. */
  select?: boolean;
}

export type Widget =
  | {
      kind: 'stat';
      value: string;
      label?: string;
      caption?: string;
      tone?: WidgetTone;
      actions?: WidgetAction[];
    }
  | { kind: 'rows'; rows: WidgetRow[] }
  | { kind: 'list'; items: WidgetListItem[] }
  | { kind: 'text'; text: string }
  | { kind: 'code'; value: string; label?: string; copyable?: boolean }
  | { kind: 'card'; title?: string; icon?: IconName; tone?: WidgetTone; children: Widget[] }
  | { kind: 'badges'; badges: { label: string; tone?: WidgetTone }[] }
  | { kind: 'actions'; actions: WidgetAction[] }
  | { kind: 'link'; label: string; url: string; icon?: IconName }
  | { kind: 'form'; fields: WidgetField[]; submit: WidgetAction };

export const W = {
  stat: (value: string, opts: Omit<Extract<Widget, { kind: 'stat' }>, 'kind' | 'value'> = {}) =>
    ({ kind: 'stat', value, ...opts }) satisfies Widget,

  rows: (rows: WidgetRow[]) => ({ kind: 'rows', rows }) satisfies Widget,

  list: (items: WidgetListItem[]) => ({ kind: 'list', items }) satisfies Widget,

  text: (text: string) => ({ kind: 'text', text }) satisfies Widget,

  code: (value: string, opts: { label?: string; copyable?: boolean } = {}) =>
    ({ kind: 'code', value, copyable: true, ...opts }) satisfies Widget,

  card: (children: Widget[], opts: { title?: string; icon?: IconName; tone?: WidgetTone } = {}) =>
    ({ kind: 'card', children, ...opts }) satisfies Widget,

  badges: (badges: Extract<Widget, { kind: 'badges' }>['badges']) =>
    ({ kind: 'badges', badges }) satisfies Widget,

  actions: (actions: WidgetAction[]) => ({ kind: 'actions', actions }) satisfies Widget,

  link: (label: string, url: string, icon?: IconName) =>
    ({ kind: 'link', label, url, icon }) satisfies Widget,

  form: (fields: WidgetField[], submit: WidgetAction) =>
    ({ kind: 'form', fields, submit }) satisfies Widget,
} as const;

const isTone = oneOf(...WIDGET_TONES);
const isState = oneOf(...WIDGET_STATES);
/** Any name: an icon this build lacks renders as nothing rather than dropping the widget. */
const isIcon = (value: unknown): value is IconName => typeof value === 'string';
const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(isString);

const isAction = shape<WidgetAction>({
  label: isString,
  command: isString,
  tone: optional(isTone),
  icon: optional(isIcon),
});
const isActions = optional(arrayOf(isAction));

const isRow = shape<WidgetRow>({
  label: isString,
  value: isString,
  tone: optional(isTone),
  state: optional(isState),
  actions: isActions,
});

const isListItem = shape<WidgetListItem>({
  title: isString,
  subtitle: optional(isString),
  icon: optional(isIcon),
  tone: optional(isTone),
  status: optional(isString),
  state: optional(isState),
  actions: isActions,
});

const isField = shape<WidgetField>({
  id: isString,
  label: isString,
  placeholder: optional(isString),
  value: optional(isString),
  keyboard: optional(oneOf(...FIELD_KEYBOARDS)),
  hint: optional(isString),
  optional: optional(isBoolean),
  options: optional(
    arrayOf(
      shape<WidgetOption>({ label: isString, value: isString, when: optional(isStringRecord) })
    )
  ),
  select: optional(isBoolean),
});

type WidgetFields<K extends Widget['kind']> = Omit<Extract<Widget, { kind: K }>, 'kind'>;

const WIDGET_FIELDS: { [K in Widget['kind']]: Guard<WidgetFields<K>> } = {
  stat: shape<WidgetFields<'stat'>>({
    value: isString,
    label: optional(isString),
    caption: optional(isString),
    tone: optional(isTone),
    actions: isActions,
  }),
  rows: shape<WidgetFields<'rows'>>({ rows: arrayOf(isRow) }),
  list: shape<WidgetFields<'list'>>({ items: arrayOf(isListItem) }),
  text: shape<WidgetFields<'text'>>({ text: isString }),
  code: shape<WidgetFields<'code'>>({
    value: isString,
    label: optional(isString),
    copyable: optional(isBoolean),
  }),
  card: shape<WidgetFields<'card'>>({
    title: optional(isString),
    icon: optional(isIcon),
    tone: optional(isTone),
    children: arrayOf((child): child is Widget => isWidget(child) || isNewerWidget(child)),
  }),
  badges: shape<WidgetFields<'badges'>>({
    badges: arrayOf(shape({ label: isString, tone: optional(isTone) })),
  }),
  actions: shape<WidgetFields<'actions'>>({ actions: arrayOf(isAction) }),
  link: shape<WidgetFields<'link'>>({ label: isString, url: isString, icon: optional(isIcon) }),
  form: shape<WidgetFields<'form'>>({ fields: arrayOf(isField), submit: isAction }),
};

function isNewerWidget(value: unknown): boolean {
  return isRecord(value) && isString(value.kind) && !Object.hasOwn(WIDGET_FIELDS, value.kind);
}

export function isWidget(value: unknown): value is Widget {
  if (!isRecord(value) || !isString(value.kind) || !Object.hasOwn(WIDGET_FIELDS, value.kind)) {
    return false;
  }
  return WIDGET_FIELDS[value.kind as Widget['kind']](value);
}

export function summariseWidget(widget: Widget): string {
  switch (widget.kind) {
    case 'stat':
      return [widget.label, widget.value].filter(Boolean).join(': ');
    case 'rows':
      return widget.rows.map((r) => `${r.label}: ${r.value}`).join(' · ');
    case 'list':
      return widget.items.map((i) => i.title).join(' · ');
    case 'text':
      return widget.text;
    case 'code':
      return widget.label ? `${widget.label}: ${widget.value}` : widget.value;
    case 'card':
      return [widget.title, ...widget.children.map(summariseWidget)].filter(Boolean).join(' · ');
    case 'badges':
      return widget.badges.map((b) => b.label).join(' · ');
    case 'actions':
      return widget.actions.map((a) => a.label).join(' · ');
    case 'link':
      return widget.label;
    case 'form':
      return [widget.submit.label, ...widget.fields.map((f) => f.label)].join(' · ');
  }
}

export function fillCommand(command: string, values: Record<string, string>): string {
  return command.replace(/\{(\w+)\}/g, (_, id: string) => {
    const value = (values[id] ?? '').trim();
    return /\s/.test(value) ? `"${value}"` : value;
  });
}

function optionShown(option: WidgetOption, values: Record<string, string>): boolean {
  return !option.when || Object.entries(option.when).every(([id, value]) => values[id] === value);
}

export function visibleOptions(field: WidgetField, values: Record<string, string>): WidgetOption[] {
  return (field.options ?? []).filter((option) => optionShown(option, values));
}

export function displayValues(
  fields: WidgetField[],
  values: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => {
      const chosen = field.options?.find(
        (option) => option.value === values[field.id] && optionShown(option, values)
      );
      return [field.id, chosen?.label ?? values[field.id] ?? ''];
    })
  );
}

export function normaliseDecimal(text: string, separator: string): string {
  return text.split(separator).join('.');
}

export function fillText(text: string, display: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, id: string) => display[id] || whole);
}

export function resolveValues(
  fields: WidgetField[],
  values: Record<string, string>
): Record<string, string> {
  let out = values;
  for (const field of fields) {
    if (!field.options) continue;
    const visible = visibleOptions(field, out);
    if (visible.length === 0) continue;
    if (!visible.some((option) => option.value === out[field.id])) {
      out = { ...out, [field.id]: visible[0].value };
    }
  }
  return out;
}
