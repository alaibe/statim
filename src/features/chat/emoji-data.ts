import emojiData from 'rn-emoji-keyboard/src/assets/emojis.json';

import type { IconName } from '@/design';

interface EmojiEntry {
  emoji: string;
  name: string;
  keywords?: string[];
}

interface Category {
  id: string;
  title: string;
  icon: IconName;
  emojis: string[];
}

export type EmojiRow =
  | { kind: 'header'; title: string; category: string }
  | { kind: 'emoji'; emojis: string[] };

const CATEGORY_META: Record<string, { title: string; icon: IconName }> = {
  smileys_emotion: { title: 'Smileys & Emotion', icon: 'happy-outline' },
  people_body: { title: 'People & Body', icon: 'hand-left-outline' },
  animals_nature: { title: 'Animals & Nature', icon: 'leaf-outline' },
  food_drink: { title: 'Food & Drink', icon: 'pizza-outline' },
  travel_places: { title: 'Travel & Places', icon: 'airplane-outline' },
  activities: { title: 'Activities', icon: 'football-outline' },
  objects: { title: 'Objects', icon: 'bulb-outline' },
  symbols: { title: 'Symbols', icon: 'shapes-outline' },
  flags: { title: 'Flags', icon: 'flag-outline' },
};

export const RECENT = 'recent';

const GROUPS = (emojiData as { title: string; data: EmojiEntry[] }[]).filter(
  (group) => group.title in CATEGORY_META
);

export const CATEGORIES: Category[] = GROUPS.map((group) => ({
  id: group.title,
  ...CATEGORY_META[group.title],
  emojis: group.data.map((entry) => entry.emoji),
}));

const SEARCHABLE: { emoji: string; text: string }[] = GROUPS.flatMap((group) =>
  group.data.map((entry) => ({
    emoji: entry.emoji,
    text: [entry.name, ...(entry.keywords ?? [])].join(' ').replace(/_/g, ' '),
  }))
);

export const CELL = 40;
export const HEADER = 30;

function chunk(emojis: string[], columns: number): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < emojis.length; i += columns) rows.push(emojis.slice(i, i + columns));
  return rows;
}

export function searchEmoji(query: string, limit = 120): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const found: string[] = [];
  for (const entry of SEARCHABLE) {
    if (terms.every((term) => entry.text.includes(term))) {
      found.push(entry.emoji);
      if (found.length >= limit) break;
    }
  }
  return found;
}

/** The grid's rows at `columns` wide: search results, or recents then every category with headers. */
export function emojiRows(query: string, recent: string[], columns: number) {
  const rows: EmojiRow[] = [];
  if (query) {
    for (const group of chunk(searchEmoji(query), columns))
      rows.push({ kind: 'emoji', emojis: group });
  } else {
    const groups: { id: string; title: string; emojis: string[] }[] = [];
    if (recent.length > 0) groups.push({ id: RECENT, title: 'Recently used', emojis: recent });
    for (const category of CATEGORIES) groups.push(category);
    for (const group of groups) {
      rows.push({ kind: 'header', title: group.title, category: group.id });
      for (const line of chunk(group.emojis, columns)) rows.push({ kind: 'emoji', emojis: line });
    }
  }
  const offsets: number[] = [];
  const sections: { category: string; offset: number }[] = [];
  let y = 0;
  for (const row of rows) {
    offsets.push(y);
    if (row.kind === 'header') sections.push({ category: row.category, offset: y });
    y += row.kind === 'header' ? HEADER : CELL;
  }
  return { rows, offsets, sections };
}
