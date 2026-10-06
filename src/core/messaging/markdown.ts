import { Marked, type Token, type Tokens } from 'marked';

import { mentionIdOf } from './mentions';
import { replaceShortcodes, SHORTCODE } from './shortcodes';
import type { ParticipantId } from './types';

interface SpanStyle {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly strike?: boolean;
  readonly code?: boolean;
}

export interface Span {
  readonly text: string;
  readonly style: SpanStyle;
  /** Only for links written as `[label](url)`; bare URLs stay text and are found later. */
  readonly href?: string;
  readonly mention?: ParticipantId;
}

export type Block = (
  | { readonly kind: 'paragraph'; readonly spans: readonly Span[] }
  | { readonly kind: 'heading'; readonly spans: readonly Span[] }
  | { readonly kind: 'code'; readonly text: string; readonly lang?: string }
  | { readonly kind: 'quote'; readonly blocks: readonly Block[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly start: number;
      readonly items: readonly (readonly Block[])[];
    }
  | { readonly kind: 'rule' }
) & {
  /** A blank line separated it from the block before. */
  readonly spaced?: boolean;
};

// Chat text is not a document: indentation and underlined lines are not code
// or headings there, so those two CommonMark rules are off.
const marked = new Marked({
  gfm: true,
  breaks: true,
  tokenizer: {
    code: () => undefined,
    lheading: () => undefined,
  },
  renderer: {
    html: ({ text }) => escapeHtml(text),
  },
});

const MARKUP = /[*_~`>#[\\]|^\s*(?:[-+]|\d+[.)])\s/m;

export function hasMarkup(text: string): boolean {
  return MARKUP.test(text);
}

const hasShortcode = (text: string) => text.includes(':') && new RegExp(SHORTCODE).test(text);

const parsed = new Map<string, readonly Block[]>();
const PARSED_LIMIT = 500;

export function parseMarkdown(text: string): readonly Block[] {
  if (!hasMarkup(text)) {
    return [{ kind: 'paragraph', spans: [{ text: replaceShortcodes(text), style: {} }] }];
  }
  let result = parsed.get(text);
  if (!result) {
    result = blocks(marked.lexer(text));
    if (parsed.size >= PARSED_LIMIT) parsed.delete(parsed.keys().next().value!);
    parsed.set(text, result);
  }
  return result;
}

function blocks(tokens: Token[]): Block[] {
  const out: Block[] = [];
  let spaced = false;
  for (const token of tokens) {
    if (token.type === 'space') {
      spaced = out.length > 0;
      continue;
    }
    const block = toBlock(token);
    if (!block) continue;
    const last = out.at(-1);
    // Bridges send one quote per paragraph; a reader sees a single quote.
    if (block.kind === 'quote' && last?.kind === 'quote') {
      const [first, ...rest] = block.blocks;
      const joined = first ? [{ ...first, spaced }, ...rest] : [];
      out[out.length - 1] = { ...last, blocks: [...last.blocks, ...joined] };
      spaced = false;
      continue;
    }
    out.push(spaced ? { ...block, spaced } : block);
    spaced = false;
  }
  return out;
}

function toBlock(token: Token): Block | null {
  switch (token.type) {
    case 'paragraph':
    case 'text':
      return { kind: 'paragraph', spans: inline(token.tokens ?? [token]) };
    case 'heading':
      return { kind: 'heading', spans: inline((token as Tokens.Heading).tokens) };
    case 'code': {
      const code = token as Tokens.Code;
      return { kind: 'code', text: code.text, lang: code.lang || undefined };
    }
    case 'blockquote':
      return { kind: 'quote', blocks: blocks((token as Tokens.Blockquote).tokens) };
    case 'list': {
      const list = token as Tokens.List;
      return {
        kind: 'list',
        ordered: list.ordered,
        start: typeof list.start === 'number' ? list.start : 1,
        items: list.items.map((item) => blocks(item.tokens)),
      };
    }
    case 'hr':
      return { kind: 'rule' };
    case 'def':
      return null;
    default:
      return { kind: 'paragraph', spans: [{ text: token.raw.replace(/\n+$/, ''), style: {} }] };
  }
}

function inline(tokens: Token[], style: SpanStyle = {}, href?: string): Span[] {
  const spans: Span[] = [];
  const push = (text: string, spanStyle = style, spanHref = href) => {
    if (!text) return;
    const last = spans.at(-1);
    if (last && !last.mention && last.href === spanHref && sameStyle(last.style, spanStyle))
      spans[spans.length - 1] = { ...last, text: last.text + text };
    else spans.push({ text, style: spanStyle, href: spanHref });
  };

  for (const token of tokens) {
    switch (token.type) {
      case 'strong':
        spans.push(...inline((token as Tokens.Strong).tokens, { ...style, bold: true }, href));
        break;
      case 'em':
        spans.push(...inline((token as Tokens.Em).tokens, { ...style, italic: true }, href));
        break;
      case 'del':
        spans.push(...inline((token as Tokens.Del).tokens, { ...style, strike: true }, href));
        break;
      case 'codespan':
        push((token as Tokens.Codespan).text, { ...style, code: true });
        break;
      case 'br':
        push('\n');
        break;
      case 'link': {
        const link = token as Tokens.Link;
        const mention = mentionIdOf(link.href);
        if (mention)
          spans.push(...inline(link.tokens, style).map((span) => ({ ...span, mention })));
        else if (link.text === link.href || link.href === `mailto:${link.text}`) push(link.text);
        else spans.push(...inline(link.tokens, style, link.href));
        break;
      }
      case 'image': {
        const image = token as Tokens.Image;
        push(image.text || image.href, style, image.href);
        break;
      }
      case 'text':
        if ('tokens' in token && token.tokens?.length)
          spans.push(...inline(token.tokens, style, href));
        else push(replaceShortcodes((token as Tokens.Text).text));
        break;
      case 'escape':
        push((token as Tokens.Escape).text);
        break;
      default:
        push(token.raw);
    }
  }
  return spans;
}

function sameStyle(a: SpanStyle, b: SpanStyle): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.strike === !!b.strike &&
    !!a.code === !!b.code
  );
}

export function listMarker(list: Extract<Block, { kind: 'list' }>, index: number): string {
  return list.ordered ? `${list.start + index}.` : '•';
}

/** The text a reader sees, with the markup gone: for previews, copying and finding links. */
export function plainText(text: string): string {
  if (!hasMarkup(text)) return hasShortcode(text) ? replaceShortcodes(text) : text;
  return blocksText(parseMarkdown(text));
}

function blocksText(list: readonly Block[]): string {
  return list
    .map((block, i) => (i > 0 ? (block.spaced ? '\n\n' : '\n') : '') + blockText(block))
    .join('');
}

function blockText(block: Block): string {
  switch (block.kind) {
    case 'paragraph':
    case 'heading':
      return block.spans.map((span) => span.text).join('');
    case 'code':
      return block.text;
    case 'quote':
      return blocksText(block.blocks);
    case 'list':
      return block.items.map((item, i) => `${listMarker(block, i)} ${blocksText(item)}`).join('\n');
    case 'rule':
      return '———';
  }
}

function* spansOf(list: readonly Block[]): Generator<Span> {
  for (const block of list) {
    if (block.kind === 'paragraph' || block.kind === 'heading') yield* block.spans;
    else if (block.kind === 'quote') yield* spansOf(block.blocks);
    else if (block.kind === 'list') for (const item of block.items) yield* spansOf(item);
  }
}

/** Links written as `[label](url)`, which reading the plain text alone would miss. */
export function labelledLinks(text: string): string[] {
  if (!hasMarkup(text)) return [];
  return [...spansOf(parseMarkdown(text))].flatMap((span) => (span.href ? [span.href] : []));
}

export function mentionedIds(text: string): ParticipantId[] {
  if (!hasMarkup(text)) return [];
  const ids = [...spansOf(parseMarkdown(text))].flatMap((span) => span.mention ?? []);
  return [...new Set(ids)];
}

/** HTML for protocols that carry formatting that way, or null when there is none. */
export function markdownHtml(text: string, linkTo?: (href: string) => string): string | null {
  if (!hasMarkup(text)) return null;
  const walkTokens = linkTo
    ? (token: Token) => {
        if (token.type === 'link') (token as Tokens.Link).href = linkTo(token.href);
      }
    : undefined;
  const html = (marked.parse(text, { async: false, walkTokens }) as string).trim();
  const plain = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
  return html === plain ? null : html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
