import { parseCommand } from './parser';
import { pollCommand } from './poll';
import { useChatStore } from '@/core/messaging/chat-store';
import { testChat } from '@/core/messaging/testing/chats';
import { asChatId } from '@/core/messaging/testing/ids';

describe('/poll', () => {
  const original = useChatStore.getState();
  afterEach(() => useChatStore.setState(original, true));

  it('sends quoted choices to the poll capability', async () => {
    const createPoll = jest.fn(async () => {});
    useChatStore.setState({
      chats: [testChat({ id: 'telegram-42', kind: 'group', title: 'Team', canSend: true })],
      createPoll,
    });
    const parsed = parseCommand('/poll "Where to eat?" "Pizza place" "Soup bar"')!;
    expect(
      await pollCommand.run({
        ...parsed,
        chatId: asChatId('telegram-42'),
        respond: async () => {},
        context: {} as never,
      })
    ).toEqual({ type: 'handled' });
    expect(createPoll).toHaveBeenCalledWith('telegram-42', 'Where to eat?', [
      'Pizza place',
      'Soup bar',
    ]);
  });

  it('refuses where the chat’s network has no polls', async () => {
    const createPoll = jest.fn(async () => {});
    useChatStore.setState({
      chats: [testChat({ id: 'matrix-42', kind: 'group', title: 'Slack', lacks: ['poll'] })],
      createPoll,
    });
    const parsed = parseCommand('/poll "Where to eat?" "Pizza place" "Soup bar"')!;
    expect(
      await pollCommand.run({
        ...parsed,
        chatId: asChatId('matrix-42'),
        respond: async () => {},
        context: {} as never,
      })
    ).toMatchObject({ type: 'error' });
    expect(createPoll).not.toHaveBeenCalled();
  });
});
