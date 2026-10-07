import { botChatId, SAVED_LOCAL_ID } from './bots';
import { chatPermissions } from './permissions';
import type { ChatSession } from './protocol';
import { testChat } from './testing/chats';

const session = (...methods: string[]) =>
  Object.fromEntries(methods.map((method) => [method, async () => {}])) as unknown as ChatSession;

describe('chatPermissions', () => {
  it('sends in a DM or a group, and in a channel only where the protocol says so', () => {
    expect(chatPermissions(testChat(), undefined).send).toBe(true);
    expect(chatPermissions(testChat({ kind: 'group' }), undefined).send).toBe(true);
    expect(chatPermissions(testChat({ kind: 'channel' }), undefined).send).toBe(false);
    expect(chatPermissions(testChat({ kind: 'channel', canSend: true }), undefined).send).toBe(
      true
    );
    expect(chatPermissions(testChat({ kind: 'group', canSend: false }), undefined).send).toBe(
      false
    );
  });

  it('offers only the message actions the session has', () => {
    expect(chatPermissions(testChat(), session())).toMatchObject({
      edit: false,
      delete: false,
      deleteForMe: false,
      pin: false,
    });
    expect(
      chatPermissions(
        testChat(),
        session('editMessage', 'deleteMessage', 'deleteMessageForMe', 'setMessagePinned')
      )
    ).toMatchObject({ edit: true, delete: true, deleteForMe: true, pin: true });
  });

  it('deletes others’ messages only where the protocol grants it and the session deletes', () => {
    const deletes = session('deleteMessage');
    expect(chatPermissions(testChat(), deletes).deleteOthers).toBe(false);
    expect(chatPermissions(testChat({ canDeleteOthers: true }), deletes).deleteOthers).toBe(true);
    expect(chatPermissions(testChat({ canDeleteOthers: true }), session()).deleteOthers).toBe(
      false
    );
  });

  it('pins unless the chat forbids it', () => {
    const pins = session('setMessagePinned');
    expect(chatPermissions(testChat(), pins).pin).toBe(true);
    expect(chatPermissions(testChat({ canPin: false }), pins).pin).toBe(false);
  });

  it('answers a request only where the session can accept or decline one', () => {
    const answers = session('setConsent');
    expect(chatPermissions(testChat({ consent: 'request' }), answers).answerRequest).toBe(true);
    expect(chatPermissions(testChat({ consent: 'request' }), session()).answerRequest).toBe(false);
    expect(chatPermissions(testChat(), answers).answerRequest).toBe(false);
    expect(chatPermissions(testChat({ consent: 'declined' }), answers).answerRequest).toBe(false);
    expect(
      chatPermissions(testChat({ consent: 'request', blocked: true }), answers).answerRequest
    ).toBe(false);
  });

  it('blocks only in a DM, and sends nothing to someone blocked', () => {
    const blocks = session('setBlocked');
    expect(chatPermissions(testChat(), blocks).block).toBe(true);
    expect(chatPermissions(testChat(), session()).block).toBe(false);
    expect(chatPermissions(testChat({ kind: 'group' }), blocks).block).toBe(false);
    expect(chatPermissions(testChat({ blocked: true }), blocks)).toMatchObject({
      block: true,
      send: false,
    });
  });

  it('lets an owner or admin add and remove group members, and invite where the session makes links', () => {
    const links = session('createInviteLink');
    expect(chatPermissions(testChat({ kind: 'group', selfRole: 'admin' }), links)).toMatchObject({
      addMembers: true,
      removeMembers: true,
      invite: true,
    });
    expect(chatPermissions(testChat({ kind: 'group', selfRole: 'member' }), links)).toMatchObject({
      addMembers: false,
      removeMembers: false,
      invite: false,
    });
    expect(chatPermissions(testChat({ kind: 'channel', selfRole: 'owner' }), links)).toMatchObject({
      addMembers: false,
      removeMembers: false,
      invite: true,
    });
    expect(chatPermissions(testChat({ kind: 'group', selfRole: 'owner' }), session()).invite).toBe(
      false
    );
  });

  it('sends pictures where the session does, and in the app’s own chats that take files', () => {
    const pictures = { sendsImages: true } as unknown as ChatSession;
    expect(chatPermissions(testChat(), session())).toMatchObject({
      attach: true,
      sendImages: false,
    });
    expect(chatPermissions(testChat(), pictures).sendImages).toBe(true);
    expect(chatPermissions(testChat({ id: SAVED_LOCAL_ID }), undefined)).toMatchObject({
      attach: true,
      sendImages: true,
    });
    expect(chatPermissions(testChat({ id: botChatId('echo') }), undefined)).toMatchObject({
      attach: false,
      sendImages: false,
    });
  });

  it('mentions in a group and shows group details outside a DM', () => {
    const both = session('mentionCandidates', 'getGroupInfo');
    expect(chatPermissions(testChat(), both)).toMatchObject({
      mention: false,
      seeGroupInfo: false,
    });
    expect(chatPermissions(testChat({ kind: 'group' }), both)).toMatchObject({
      mention: true,
      seeGroupInfo: true,
    });
    expect(chatPermissions(testChat({ kind: 'channel' }), both)).toMatchObject({
      mention: false,
      seeGroupInfo: true,
    });
  });

  it('bans and mutes members only for a group’s owner or admin, where the session can', () => {
    const moderates = session('banMember', 'setMemberMuted');
    expect(
      chatPermissions(testChat({ kind: 'group', selfRole: 'admin' }), moderates)
    ).toMatchObject({ ban: true, muteMembers: true });
    expect(
      chatPermissions(testChat({ kind: 'group', selfRole: 'member' }), moderates)
    ).toMatchObject({ ban: false, muteMembers: false });
    expect(
      chatPermissions(testChat({ kind: 'group', selfRole: 'owner' }), session())
    ).toMatchObject({ ban: false, muteMembers: false });
  });

  it('withholds what the chat’s network lacks, whatever the session can do', () => {
    const everything = Object.assign(
      session('editMessage', 'deleteMessage', 'setMessagePinned', 'votePoll', 'banMember'),
      { threads: true, sendsImages: true, sendsVideo: true }
    );
    const admin = { kind: 'group', selfRole: 'admin', canDeleteOthers: true } as const;
    expect(chatPermissions(testChat(admin), everything)).toMatchObject({
      edit: true,
      delete: true,
      deleteOthers: true,
      pin: true,
      vote: true,
      thread: true,
      react: true,
      sendImages: true,
      sendVideo: true,
      addMembers: true,
      removeMembers: true,
      ban: true,
    });
    const lacks = [
      'edit',
      'delete',
      'pin',
      'poll',
      'thread',
      'react',
      'images',
      'video',
      'invite',
      'remove',
      'ban',
    ] as const;
    expect(chatPermissions(testChat({ ...admin, lacks }), everything)).toMatchObject({
      edit: false,
      delete: false,
      deleteOthers: false,
      pin: false,
      vote: false,
      thread: false,
      react: false,
      sendImages: false,
      sendVideo: false,
      addMembers: false,
      removeMembers: false,
      ban: false,
    });
  });
});
