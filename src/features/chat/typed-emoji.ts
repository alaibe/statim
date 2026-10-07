import { emojiNamed } from '@/core/messaging/shortcodes';

const EMOTICONS: Record<string, string> = {
  ':)': '🙂',
  ':-)': '🙂',
  ':D': '😄',
  ':-D': '😄',
  xD: '😆',
  XD: '😆',
  ":')": '😂',
  ';)': '😉',
  ';-)': '😉',
  'O:)': '😇',
  'o:)': '😇',
  ':*': '😘',
  ':-*': '😘',
  ':P': '😛',
  ':p': '😛',
  ':-P': '😛',
  ':-p': '😛',
  ';P': '😜',
  ';p': '😜',
  ':|': '😐',
  ':/': '😕',
  ':-/': '😕',
  ':(': '🙁',
  ':-(': '🙁',
  ":'(": '😢',
  ':O': '😮',
  ':o': '😮',
  ':-O': '😮',
  ':-o': '😮',
  '>:(': '😠',
  '<3': '❤️',
  '</3': '💔',
};

const EMOTICON = new RegExp(
  `(?:^|\\s)(${Object.keys(EMOTICONS)
    .sort((a, b) => b.length - a.length)
    .map((emoticon) => emoticon.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('|')})$`
);
const SHORTCODE = /(?:^|[\s([{"'])(:[a-z0-9_+-]+:)$/;

export interface TypedEmoji {
  from: number;
  to: number;
  emoji: string;
}

/**
 * The emoji that the text up to the caret has just closed: an emoticon once a
 * space follows it, a `:shortcode:` at its closing colon. Never inside code.
 */
export function typedEmoji(before: string): TypedEmoji | null {
  const found = closed(before);
  if (!found || (before.slice(0, found.from).match(/`/g)?.length ?? 0) % 2 === 1) return null;
  return found;
}

function closed(before: string): TypedEmoji | null {
  if (before.endsWith(':')) {
    const code = SHORTCODE.exec(before)?.[1];
    const emoji = code && emojiNamed(code.slice(1, -1));
    return emoji ? { from: before.length - code.length, to: before.length, emoji } : null;
  }
  if (!/\s$/.test(before)) return null;
  const text = before.slice(0, -1);
  const emoticon = EMOTICON.exec(text)?.[1];
  return emoticon
    ? { from: text.length - emoticon.length, to: text.length, emoji: EMOTICONS[emoticon] }
    : null;
}

/** Commands take their arguments as typed. */
export const isCommand = (text: string) => text.trimStart().startsWith('/');

/** `next` with the emoji its one newly typed character closed, for a field that only reports its whole text. */
export function withTypedEmoji(previous: string, next: string): string {
  if (next.length !== previous.length + 1 || isCommand(next)) return next;
  let at = 0;
  while (at < previous.length && previous[at] === next[at]) at += 1;
  if (next.slice(at + 1) !== previous.slice(at)) return next;
  return replaced(next, typedEmoji(next.slice(0, at + 1)));
}

/** `text` with the emoticon it ends on as its emoji, for sending. */
export function withFinalEmoji(text: string): string {
  return isCommand(text) ? text : replaced(text, typedEmoji(`${text} `));
}

function replaced(text: string, found: TypedEmoji | null): string {
  return found ? text.slice(0, found.from) + found.emoji + text.slice(found.to) : text;
}
