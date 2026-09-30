import { useChatStore } from '@/core/messaging/chat-store';
import { testChat } from '@/core/messaging/testing/chats';
import { asChatId } from '@/core/messaging/testing/ids';
import type { ChatId } from '@/core/messaging/types';
import type { PluginContext } from '@/core/plugins/types';

import { moveCommand, moveNames, movePreview, moveViews } from './move';
import { MOVE_ACK, moveInviteText } from './move-invite';

const SELF = '0x00000000000000000000000000000000000000aa';
const THEIRS = '0x00000000000000000000000000000000000000bb';
const TELEGRAM = asChatId('telegram-42');
const XMTP_DM = asChatId('xmtp-dm1');

function makeContext() {
  const stored = new Map<string, unknown>();
  const sent: [ChatId, string][] = [];
  const opened: ChatId[] = [];
  const startDm = jest.fn(async (_address: string): Promise<ChatId | null> => XMTP_DM);
  const context = {
    manifest: { id: 'profile' },
    storage: {
      get: async (key: string) => stored.get(key) ?? null,
      set: async (key: string, value: unknown) => void stored.set(key, value),
      remove: async (key: string) => void stored.delete(key),
    },
    account: { address: SELF, participantId: 'inbox-me' },
    chat: {
      startDm,
      sendText: async (chatId: ChatId, text: string) => void sent.push([chatId, text]),
      members: async () => ['inbox-me', 'inbox-alice'],
    },
    ui: { openChat: (chatId: ChatId) => void opened.push(chatId) },
  } as unknown as PluginContext;
  return { context, sent, opened, startDm };
}

function run(context: PluginContext, chatId: ChatId, args: string[] = []) {
  return moveCommand(context).run({
    chatId,
    args,
    rest: args.join(' '),
    respond: async () => {},
    context,
  });
}

beforeEach(() => {
  useChatStore.setState({
    chats: [testChat({ id: TELEGRAM, title: 'Alice' }), testChat({ id: XMTP_DM })],
    sessions: { xmtp: {} as never },
  });
});

describe('/move', () => {
  it('sends an invite with your XMTP address', async () => {
    const { context, sent } = makeContext();

    await expect(run(context, TELEGRAM)).resolves.toEqual({ type: 'handled' });
    expect(sent).toEqual([[TELEGRAM, moveInviteText(SELF)]]);
  });

  it('refuses a chat that is already on XMTP', async () => {
    const { context, sent } = makeContext();

    await expect(run(context, XMTP_DM)).resolves.toMatchObject({ type: 'error' });
    expect(sent).toEqual([]);
  });

  it('refuses while XMTP is not connected, since the reply could not arrive', async () => {
    useChatStore.setState({ sessions: {} });
    const { context, sent } = makeContext();

    await expect(run(context, TELEGRAM)).resolves.toMatchObject({ type: 'error' });
    expect(sent).toEqual([]);
  });

  it('accepting starts the XMTP DM, says where it came from and names them', async () => {
    const { context, sent, opened, startDm } = makeContext();

    await expect(run(context, TELEGRAM, ['accept', THEIRS])).resolves.toEqual({
      type: 'handled',
    });

    expect(startDm).toHaveBeenCalledWith(THEIRS);
    expect(sent).toEqual([[XMTP_DM, MOVE_ACK]]);
    expect(opened).toEqual([XMTP_DM]);
    await expect(moveNames(context)).resolves.toEqual({ 'inbox-alice': 'Alice' });
  });

  it('opens the XMTP chat when an invite is accepted again, without a second hello', async () => {
    const { context, sent, opened, startDm } = makeContext();
    await run(context, TELEGRAM, ['accept', THEIRS]);

    await run(context, TELEGRAM, ['accept', THEIRS.toUpperCase().replace('0X', '0x')]);

    expect(startDm).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    expect(opened).toEqual([XMTP_DM, XMTP_DM]);
  });

  it('refuses to accept an invite to your own address', async () => {
    const { context, startDm } = makeContext();

    await expect(run(context, TELEGRAM, ['accept', SELF])).resolves.toMatchObject({
      type: 'error',
    });
    expect(startDm).not.toHaveBeenCalled();
  });

  it('reports an address XMTP cannot reach', async () => {
    const { context, startDm, sent } = makeContext();
    startDm.mockResolvedValueOnce(null);

    await expect(run(context, TELEGRAM, ['accept', THEIRS])).resolves.toMatchObject({
      type: 'error',
    });
    expect(sent).toEqual([]);
  });
});

describe('the invite card', () => {
  it('claims invite text and nothing else', () => {
    expect(movePreview.match(moveInviteText(THEIRS))).toEqual([THEIRS]);
    expect(movePreview.match(`My XMTP address: ${THEIRS}`)).toBeNull();
  });

  it('offers to continue, then to open the chat once it has moved', async () => {
    const { context } = makeContext();
    const { move } = moveViews(context);
    const labels = async () =>
      JSON.stringify((await move([THEIRS])).widget).match(/"label":"[^"]*"/g);

    await expect(labels()).resolves.toEqual(['"label":"Continue on XMTP"']);
    await run(context, TELEGRAM, ['accept', THEIRS]);
    await expect(labels()).resolves.toEqual(['"label":"Open XMTP chat"']);
  });
});
