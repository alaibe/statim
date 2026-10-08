import { InMemoryChatSession } from './in-memory-session';
import { protocolChatId } from './namespace';

it('rejects delivery to an unknown chat before storing or emitting the message', async () => {
  const session = new InMemoryChatSession();
  const listener = jest.fn();
  await session.streamMessages(listener);

  expect(() => session.deliver('missing')).toThrow('Chat missing not found');
  expect(listener).not.toHaveBeenCalled();
  expect(await session.getMessages(protocolChatId('missing'))).toEqual([]);

  session.seedChat({ id: 'missing' });
  const message = session.deliver('missing');
  expect(listener).toHaveBeenCalledWith(message);
  expect((await session.listChats())[0].lastMessage).toEqual(message);
});

it('rejects changes to an unknown chat without announcing it', async () => {
  const session = new InMemoryChatSession();
  const listener = jest.fn();
  await session.streamChats(listener);
  const id = protocolChatId('missing');

  await expect(session.setConsent(id, 'accepted')).rejects.toThrow('Chat missing not found');
  await expect(session.setBlocked(id, true)).rejects.toThrow('Chat missing not found');
  await expect(session.send(id, { kind: 'text', text: 'hi' })).rejects.toThrow(
    'Chat missing not found'
  );
  expect(session.sent).toEqual([]);
  expect(listener).not.toHaveBeenCalled();
});
