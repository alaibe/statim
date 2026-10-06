import type { ChatId } from '@/core/messaging/types';

import { useChatHistory } from './chat-history';

const [a, b, c, d] = ['xmtp-a', 'xmtp-b', 'xmtp-c', 'xmtp-d'] as ChatId[];
const always = () => true;

beforeEach(() => {
  useChatHistory.setState({ back: [], current: null, forward: [], recent: [] });
});

describe('chat history', () => {
  it('goes back and forward through the chats opened', () => {
    const { visit, step } = useChatHistory.getState();
    visit(a);
    visit(b);
    visit(c);

    expect(step('back', always)).toBe(b);
    expect(step('back', always)).toBe(a);
    expect(step('back', always)).toBeNull();
    expect(step('forward', always)).toBe(b);
    expect(useChatHistory.getState().current).toBe(b);
  });

  it('drops the way forward when another chat opens', () => {
    const { visit, step } = useChatHistory.getState();
    visit(a);
    visit(b);
    step('back', always);
    visit(c);

    expect(useChatHistory.getState().forward).toEqual([]);
    expect(step('back', always)).toBe(a);
  });

  it('skips chats that are gone', () => {
    const { visit, step } = useChatHistory.getState();
    visit(a);
    visit(b);
    visit(c);

    expect(step('back', (id) => id !== b)).toBe(a);
  });

  it('lists each chat once, newest first', () => {
    const { visit, step } = useChatHistory.getState();
    visit(a);
    visit(b);
    visit(a);
    visit(d);
    step('back', always);

    expect(useChatHistory.getState().recent).toEqual([a, d, b]);
  });
});
