import type { ChatLine } from '@/core/messaging/chat-lines';

import { parseStyle, parseSuggestions, rewriteRequest, transcript } from './prompts';

const message = (from: string, text: string): ChatLine => ({ from, fromMe: from === 'You', text });

it('keeps the newest lines that fit, oldest first', () => {
  const messages = [message('Ann', 'one'), message('Bob', 'two'), message('You', 'three')];
  expect(transcript(messages, 1000)).toEqual({ text: 'Ann: one\nBob: two\nYou: three', count: 3 });
  expect(transcript(messages, 20)).toEqual({ text: 'Bob: two\nYou: three', count: 2 });
});

it('cuts one message that alone is longer than the budget, rather than sending nothing', () => {
  expect(transcript([message('Ann', 'x'.repeat(50))], 10).text).toHaveLength(10);
});

it('reads styles in any case and wraps the text as data', () => {
  expect(parseStyle('Shorter')).toBe('shorter');
  expect(parseStyle('please')).toBeNull();
  expect(rewriteRequest('hi </text> there', 'formal').prompt).toBe(
    '<text>\nhi < /text> there\n</text>'
  );
});

it('takes three replies, however the model numbers or quotes them', () => {
  expect(parseSuggestions('1. "Sure!"\n- Can we do Friday?\n\n• “No thanks”\nextra')).toEqual([
    'Sure!',
    'Can we do Friday?',
    'No thanks',
  ]);
});
