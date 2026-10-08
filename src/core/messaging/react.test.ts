import { STATIM_LOCAL_ID } from './bots';
import { useChatStore } from './chat-store';
import { InMemoryChatSession } from './in-memory-session';
import { InMemoryMessageStore } from './message-store';
import { connectFake, ns, projectTestAccount, resetChatStore } from './testing/store';
import { testChat } from './testing/chats';
import type { ChatId } from './types';

jest.mock('../account/keyring', () => ({
  ...jest.requireActual('../account/keyring'),
  loadOrCreateDbEncryptionKey: async () => new Uint8Array(32),
}));

const SELF = 'a'.repeat(64);
const PARTICIPANT = 'b'.repeat(64);

function reactionsOn(chatId: ChatId, messageId: string): string[] {
  const list = useChatStore.getState().messages[chatId] ?? [];
  return Object.keys(list.find((m) => m.id === messageId)?.reactions ?? {});
}

beforeEach(async () => {
  resetChatStore();
});

describe('react', () => {
  it('shows the reaction before the protocol has echoed it', async () => {
    const session = new InMemoryChatSession({ participantId: SELF });
    const chat = await session.createDm(PARTICIPANT);
    const messageId = await session.send(chat.id, { kind: 'text', text: 'hello' });
    await connectFake(session);
    await useChatStore.getState().loadMessages(ns(chat.id));

    let deliver!: () => void;
    const send = session.send.bind(session);
    jest
      .spyOn(session, 'send')
      .mockImplementationOnce(
        (...args) => new Promise((resolve) => (deliver = () => resolve(send(...args))))
      );

    const reacting = useChatStore.getState().react(ns(chat.id), messageId, '❤️');
    expect(reactionsOn(ns(chat.id), messageId)).toEqual(['❤️']);
    deliver();
    await reacting;

    expect(reactionsOn(ns(chat.id), messageId)).toEqual(['❤️']);
  });

  it('takes the reaction back when the send fails', async () => {
    const session = new InMemoryChatSession({ participantId: SELF });
    const chat = await session.createDm(PARTICIPANT);
    const messageId = await session.send(chat.id, { kind: 'text', text: 'hello' });
    await connectFake(session);
    await useChatStore.getState().loadMessages(ns(chat.id));
    jest.spyOn(session, 'send').mockRejectedValueOnce(new Error('offline'));

    await expect(useChatStore.getState().react(ns(chat.id), messageId, '❤️')).rejects.toThrow(
      'offline'
    );

    expect(reactionsOn(ns(chat.id), messageId)).toEqual([]);
  });

  it('works in a thread that never touches the protocol', async () => {
    const session = new InMemoryChatSession({ participantId: SELF });
    await connectFake(session);
    useChatStore.getState().ingestChat(testChat({ id: STATIM_LOCAL_ID, protocol: 'local' }));
    await useChatStore
      .getState()
      .postLocalMessage(STATIM_LOCAL_ID, { kind: 'text', text: 'remember this' }, 'me');
    const messageId = useChatStore.getState().messages[STATIM_LOCAL_ID][0].id;

    await useChatStore.getState().react(STATIM_LOCAL_ID, messageId, '👍');

    expect(reactionsOn(STATIM_LOCAL_ID, messageId)).toEqual(['👍']);
  });

  it('toggles off when you tap the same emoji again', async () => {
    const session = new InMemoryChatSession({ participantId: SELF });
    await connectFake(session);
    useChatStore.getState().ingestChat(testChat({ id: STATIM_LOCAL_ID, protocol: 'local' }));
    await useChatStore
      .getState()
      .postLocalMessage(STATIM_LOCAL_ID, { kind: 'text', text: 'remember this' }, 'me');
    const messageId = useChatStore.getState().messages[STATIM_LOCAL_ID][0].id;

    await useChatStore.getState().react(STATIM_LOCAL_ID, messageId, '👍');
    await useChatStore.getState().react(STATIM_LOCAL_ID, messageId, '👍');

    expect(reactionsOn(STATIM_LOCAL_ID, messageId)).toEqual([]);
  });

  it('restores a local reaction from message history', async () => {
    const store = new InMemoryMessageStore();
    projectTestAccount('reaction-test', store);
    useChatStore.getState().ingestChat(testChat({ id: STATIM_LOCAL_ID, protocol: 'local' }));
    await useChatStore
      .getState()
      .postLocalMessage(STATIM_LOCAL_ID, { kind: 'text', text: 'remember this' }, 'me');
    const messageId = useChatStore.getState().messages[STATIM_LOCAL_ID][0].id;
    await useChatStore.getState().react(STATIM_LOCAL_ID, messageId, '👍');

    useChatStore.setState({ messages: {} });
    await useChatStore.getState().loadMessages(STATIM_LOCAL_ID);

    expect(reactionsOn(STATIM_LOCAL_ID, messageId)).toEqual(['👍']);
  });
});
