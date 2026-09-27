import { applyMention } from './use-mention-suggestions';

jest.mock('@/core/messaging/chat-store', () => ({ useChatStore: jest.fn() }));

describe('applyMention', () => {
  it('fills in an address where the person has one', () => {
    expect(applyMention('hey @bo', { id: '200', name: 'Bob', address: '@bob' })).toBe('hey @bob ');
  });

  it('links to someone without an address by name', () => {
    expect(applyMention('hey @ca', { id: '300', name: 'Carol' })).toBe('hey [Carol](mention:300) ');
  });
});
