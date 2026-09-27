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
    expect(chatPermissions(undefined, undefined).send).toBe(true);
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
});
