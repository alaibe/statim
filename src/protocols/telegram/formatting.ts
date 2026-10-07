import {
  type Block,
  hasMarkup,
  listMarker,
  parseMarkdown,
  type Span,
} from '@/core/messaging/markdown';
import { mentionHref } from '@/core/messaging/mentions';

import type { TdObject } from './api';
import type { TdFormattedText } from './types';

interface Entity {
  offset: number;
  length: number;
  type: TdObject;
}

interface Mark {
  at: number;
  open: boolean;
  /** Orders marks at one position: outer opens first, inner closes first. */
  rank: number;
  text: string;
  verbatim?: boolean;
  quote?: boolean;
}

const INLINE: Record<string, string> = {
  textEntityTypeBold: '**',
  textEntityTypeItalic: '*',
  textEntityTypeStrikethrough: '~~',
};

/** TDLib's entities as the Markdown the rest of the app reads. */
export function formattedToMarkdown(formatted: { text: string; entities?: TdObject[] }): string {
  const { text } = formatted;
  const entities = (formatted.entities ?? []) as unknown as Entity[];
  const marks = entities
    .flatMap((entity) => entityMarks(text, entity))
    .sort((a, b) => a.at - b.at || Number(a.open) - Number(b.open) || a.rank - b.rank);
  return render(text, marks);
}

function entityMarks(text: string, { offset, length, type }: Entity): Mark[] {
  const kind = type['@type'] as string;
  const end = offset + length;

  if (kind === 'textEntityTypePre' || kind === 'textEntityTypePreCode') {
    const language = (type.language as string | undefined) ?? '';
    const before = newlineBefore(text, offset);
    const after = end < text.length && text[end] !== '\n' ? '\n' : '';
    return pair(offset, end, `${before}\`\`\`${language}\n`, `\n\`\`\`${after}`, {
      verbatim: true,
    });
  }
  if (kind === 'textEntityTypeBlockQuote' || kind === 'textEntityTypeExpandableBlockQuote') {
    const after = end >= text.length ? '' : text[end] === '\n' ? '\n' : '\n\n';
    return pair(offset, end, newlineBefore(text, offset), after, { quote: true });
  }

  let start = offset;
  let stop = end;
  while (start < stop && /\s/.test(text[start])) start++;
  while (stop > start && /\s/.test(text[stop - 1])) stop--;
  if (start === stop) return [];

  if (kind === 'textEntityTypeCode') {
    const fence = text.slice(start, stop).includes('`') ? '`` ' : '`';
    return pair(start, stop, fence, [...fence].reverse().join(''), { verbatim: true });
  }
  if (kind === 'textEntityTypeTextUrl') {
    return pair(start, stop, '[', `](${encodeUrl(type.url as string)})`);
  }
  if (kind === 'textEntityTypeMentionName') {
    return pair(start, stop, '[', `](${mentionHref(String(type.user_id))})`);
  }
  return INLINE[kind] ? pair(start, stop, INLINE[kind], INLINE[kind]) : [];
}

function pair(start: number, end: number, open: string, close: string, extra?: Partial<Mark>) {
  return [
    { at: start, open: true, rank: -end, text: open, ...extra },
    { at: end, open: false, rank: -start, text: close, ...extra },
  ];
}

function newlineBefore(text: string, at: number): string {
  return at > 0 && text[at - 1] !== '\n' ? '\n' : '';
}

function render(text: string, marks: readonly Mark[]): string {
  let out = '';
  let verbatim = 0;
  let quote = 0;
  let escapeAt = -1;
  const atLineStart = () => out === '' || out.endsWith('\n');

  const applyMark = (mark: Mark) => {
    out += mark.text;
    const depth = mark.open ? 1 : -1;
    if (mark.quote) {
      quote += depth;
      if (mark.open) out += '> ';
      return;
    }
    if (mark.verbatim) verbatim += depth;
    if (quote > 0 && mark.open && mark.verbatim && out.endsWith('\n')) out += '> ';
  };

  const writeChar = (i: number) => {
    const char = text[i];
    if (verbatim > 0) {
      out += char;
    } else {
      if (atLineStart() || (quote > 0 && out.endsWith('> '))) {
        const list = /^(\d+)[.)]\s/.exec(text.slice(i));
        if (list) escapeAt = i + list[1].length;
      }
      out += escapeChar(text, i, atLineStart()) || (i === escapeAt ? `\\${char}` : char);
    }
    if (char === '\n' && quote > 0) out += '> ';
  };

  let next = 0;
  for (let i = 0; i <= text.length; i++) {
    for (; next < marks.length && marks[next].at === i; next++) applyMark(marks[next]);
    if (i < text.length) writeChar(i);
  }
  return out;
}

function escapeChar(text: string, i: number, lineStart: boolean): string {
  const char = text[i];
  const prev = text[i - 1] ?? '';
  const after = text[i + 1] ?? '';
  const word = (c: string) => /[\p{L}\p{N}]/u.test(c);

  if ('\\*`[]'.includes(char)) return `\\${char}`;
  if (char === '_' && !(word(prev) && word(after))) return '\\_';
  if (char === '~' && prev !== '/') return '\\~';
  if (lineStart && (char === '>' || char === '#')) return `\\${char}`;
  if (lineStart && (char === '-' || char === '+') && after === ' ') return `\\${char}`;
  return '';
}

function encodeUrl(url: string): string {
  return url.replace(
    /[()\s]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`
  );
}

export function plainFormatted(text: string): TdFormattedText {
  return { '@type': 'formattedText', text, entities: [] };
}

/** The Markdown the app writes, as the text and entities TDLib sends. */
export function markdownToFormatted(markdown: string): TdFormattedText {
  if (!hasMarkup(markdown)) return plainFormatted(markdown);

  let text = '';
  const entities: TdObject[] = [];
  const entity = (start: number, type: TdObject) => {
    if (text.length > start) {
      entities.push({ '@type': 'textEntity', offset: start, length: text.length - start, type });
    }
  };

  const write = (list: readonly Block[]) => {
    list.forEach((block, i) => {
      if (i > 0) text += block.spaced ? '\n\n' : '\n';
      const start = text.length;
      switch (block.kind) {
        case 'paragraph':
        case 'heading':
          for (const span of block.spans) {
            const from = text.length;
            text += span.text;
            for (const type of spanEntityTypes(span)) entity(from, type);
          }
          if (block.kind === 'heading') entity(start, { '@type': 'textEntityTypeBold' });
          break;
        case 'code':
          text += block.text;
          entity(
            start,
            block.lang
              ? { '@type': 'textEntityTypePreCode', language: block.lang }
              : { '@type': 'textEntityTypePre' }
          );
          break;
        case 'quote':
          write(block.blocks);
          entity(start, { '@type': 'textEntityTypeBlockQuote' });
          break;
        case 'list':
          block.items.forEach((item, n) => {
            if (n > 0) text += '\n';
            text += `${listMarker(block, n)} `;
            write(item);
          });
          break;
        case 'rule':
          text += '———';
          break;
      }
    });
  };

  write(parseMarkdown(markdown));
  return { '@type': 'formattedText', text, entities };
}

const STYLE_ENTITIES = [
  ['bold', 'textEntityTypeBold'],
  ['italic', 'textEntityTypeItalic'],
  ['strike', 'textEntityTypeStrikethrough'],
  ['code', 'textEntityTypeCode'],
] as const;

function spanEntityTypes(span: Span): TdObject[] {
  const types: TdObject[] = STYLE_ENTITIES.filter(([style]) => span.style[style]).map(
    ([, type]) => ({ '@type': type })
  );
  if (span.mention && /^\d+$/.test(span.mention)) {
    types.push({ '@type': 'textEntityTypeMentionName', user_id: Number(span.mention) });
  } else if (span.href) {
    types.push({ '@type': 'textEntityTypeTextUrl', url: span.href });
  }
  return types;
}
