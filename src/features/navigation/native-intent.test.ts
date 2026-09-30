import { redirectSystemPath } from '@/app/+native-intent';
import { useChatStore } from '@/core/messaging/chat-store';
import { parseMoveInvite } from '@/plugins/profile/move-invite';

describe('links into the app', () => {
  it('pass through untouched', () => {
    expect(redirectSystemPath({ path: 'statim://chat/xmtp-abc', initial: false })).toBe(
      'statim://chat/xmtp-abc'
    );
    expect(redirectSystemPath({ path: '/fixture/nope', initial: false })).toBe('/fixture/nope');
  });

  it('open a seeded chat for a screenshot fixture in a debug build', () => {
    useChatStore.setState({ chats: [], messages: {}, rawMessages: {} });

    const to = redirectSystemPath({ path: 'statim://fixture/move-invite', initial: false });

    expect(to).toBe('/chat/telegram-alice');
    const { chats, messages } = useChatStore.getState();
    expect(chats.map((c) => c.id)).toEqual(['telegram-alice']);
    const last = messages['telegram-alice' as never]?.at(-1);
    expect(last?.content.kind === 'text' && parseMoveInvite(last.content.text)).toBeTruthy();
  });
});
