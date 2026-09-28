import { utf8ToBytes } from '@noble/hashes/utils';

import { fromHex, toHex } from '@/lib/bytes';

import { RequestState } from './contacts';
import {
  keccak256,
  publicKeyOf,
  decryptNonceFirst,
  recoverPublicKey,
  sharedSecret,
  sign,
  symmetricKeyFromPassword,
} from './crypto';
import {
  ANY_INSTALLATION,
  oneToOneGroupId,
  openEnvelope,
  readApplication,
  sealEnvelope,
  syncMessageId,
  syncRecord,
  wrapApplication,
} from './envelope';
import { GroupState, readGroupEvent, signGroupEvent } from './group';
import { chatKeyOf, parseChatKey, participantIdOf, publicKeyFromParticipant } from './keys';
import {
  AppType,
  ContentType,
  decodeChatIdentity,
  decodeChatMessage,
  decodeContactRequestDecision,
  decodeDelete,
  decodeEdit,
  decodeMembershipUpdate,
  decodeReaction,
  encodeChatMessage,
  encodeDelete,
  encodeEdit,
  encodeMvds,
  EventType,
  MessageType,
} from './messages';
import { decodePayload, encodePayload } from './payload';
import { contentTopic, partitionedTopic, personalTopic } from './topics';
import vectors from './testing/status-go-vectors.json';

const hex = (bytes: Uint8Array) => `0x${toHex(bytes)}`;
const [alice, bob, carol] = vectors.keys;
const keysOf = (vector: typeof alice) => {
  const privateKey = fromHex(vector.private);
  return { privateKey, publicKey: publicKeyOf(privateKey) };
};

describe('identity', () => {
  it.each(vectors.keys)('derives the key, chat key and topics of $seed', (vector) => {
    const publicKey = publicKeyOf(fromHex(vector.private));
    expect(participantIdOf(publicKey)).toBe(vector.public);
    expect(chatKeyOf(publicKey)).toBe(vector.compressedMultiformat);
    expect(partitionedTopic(publicKey)).toBe(vector.partitionedContentTopic);
    expect(personalTopic(publicKey)).toBe(vector.personalContentTopic);
    expect(contentTopic(vector.partitionedTopic)).toBe(vector.partitionedContentTopic);
  });

  it('reads every form of chat key people paste', () => {
    expect(parseChatKey(alice.compressedMultiformat)).toBe(alice.public);
    expect(parseChatKey(`https://status.app/u#${alice.compressedMultiformat}`)).toBe(alice.public);
    expect(parseChatKey(`https://status.app/u/CxiACgoKCEFsaWNl#${bob.compressedMultiformat}`)).toBe(
      bob.public
    );
    expect(parseChatKey(alice.public)).toBe(alice.public);
    expect(parseChatKey(alice.public.toUpperCase().replace('0X', '0x'))).toBe(alice.public);
    expect(parseChatKey(alice.compressed)).toBe(alice.public);
    expect(parseChatKey(`  ${carol.compressedMultiformat}\n`)).toBe(carol.public);
  });

  it('refuses what is not a chat key', () => {
    expect(parseChatKey('alice.stateofus.eth')).toBeNull();
    expect(parseChatKey('0x04' + '00'.repeat(64))).toBeNull();
    expect(parseChatKey(`zQ3sh${'1'.repeat(40)}`)).toBeNull();
    expect(() => publicKeyFromParticipant('0x1234')).toThrow();
  });
});

describe('primitives', () => {
  it('signs exactly as go-ethereum does', () => {
    const hash = keccak256(utf8ToBytes(vectors.signature.message));
    const signature = sign(hash, fromHex(alice.private));
    expect(hex(signature)).toBe(vectors.signature.signature);
    expect(hex(recoverPublicKey(hash, signature)!)).toBe(vectors.signature.signer);
  });

  it('agrees on the ECDH secret', () => {
    expect(hex(sharedSecret(fromHex(vectors.ecdh.private), fromHex(vectors.ecdh.public)))).toBe(
      vectors.ecdh.shared
    );
  });

  it('derives a negotiated topic and its key from a shared secret', () => {
    const password = vectors.negotiated.secret.slice(2);
    expect(contentTopic(password)).toBe(vectors.negotiated.contentTopic);
    expect(hex(symmetricKeyFromPassword(password))).toBe(vectors.negotiated.symKey);
  });
});

describe('payload codec', () => {
  it('opens what status-go sealed to a key', () => {
    const decoded = decodePayload(fromHex(vectors.rfc26Asymmetric.payload), {
      privateKey: fromHex(vectors.rfc26Asymmetric.recipientPrivate),
    });
    expect(hex(decoded!.data)).toBe(vectors.rfc26Asymmetric.data);
    expect(hex(decoded!.signer)).toBe(vectors.rfc26Asymmetric.signer);
  });

  it('opens what status-go sealed under a topic key', () => {
    const decoded = decodePayload(fromHex(vectors.rfc26Symmetric.payload), {
      symmetricKey: fromHex(vectors.rfc26Symmetric.symKey),
    });
    expect(hex(decoded!.data)).toBe(vectors.rfc26Symmetric.data);
    expect(hex(decoded!.signer)).toBe(vectors.rfc26Symmetric.signer);
  });

  it('round-trips, pads to 256 bytes and refuses the wrong key', () => {
    const sender = keysOf(alice);
    const data = utf8ToBytes('x'.repeat(300));
    const sealed = encodePayload(
      data,
      { recipient: publicKeyOf(fromHex(bob.private)) },
      sender.privateKey
    );
    expect((sealed.length - 65 - 16 - 32) % 256).toBe(0);
    const opened = decodePayload(sealed, { privateKey: fromHex(bob.private) });
    expect(opened!.data).toEqual(data);
    expect(opened!.signer).toEqual(sender.publicKey);
    expect(decodePayload(sealed, { privateKey: fromHex(carol.private) })).toBeNull();
  });
});

describe('application layer', () => {
  it('wraps a message byte for byte and gets the same id', () => {
    const wrapped = wrapApplication(
      AppType.CHAT_MESSAGE,
      fromHex(vectors.amm.chatMessage),
      keysOf(alice)
    );
    expect(hex(wrapped.bytes)).toBe(vectors.amm.amm);
    expect(wrapped.id).toBe(vectors.amm.messageId);
  });

  it('reads the author, type and id back', () => {
    const message = readApplication(fromHex(vectors.amm.amm))!;
    expect(message.id).toBe(vectors.amm.messageId);
    expect(message.type).toBe(AppType.CHAT_MESSAGE);
    expect(hex(message.signer)).toBe(vectors.amm.signer);
    const chat = decodeChatMessage(message.payload);
    expect(chat).toMatchObject({
      text: 'hello from status-go',
      chatId: bob.public,
      messageType: MessageType.ONE_TO_ONE,
      contentType: ContentType.TEXT_PLAIN,
      displayName: 'Alice',
      clock: 1_790_000_060_000,
      timestamp: 1_790_000_000_000,
      contactRequestState: { localState: RequestState.SENT, localClock: 1_790_000_059_995 },
    });
  });

  it('encodes a chat message status-go decodes to the same fields', () => {
    const decoded = decodeChatMessage(fromHex(vectors.amm.chatMessage));
    expect(decodeChatMessage(encodeChatMessage(decoded))).toEqual(decoded);
  });
});

describe('data sync', () => {
  it('derives the pairwise group id and message id', () => {
    const a = publicKeyOf(fromHex(alice.private));
    const b = publicKeyOf(fromHex(bob.private));
    expect(hex(oneToOneGroupId(a, b))).toBe(vectors.mvds.groupId);
    expect(hex(oneToOneGroupId(b, a))).toBe(vectors.mvds.groupId);
    const record = syncRecord(a, b, fromHex(vectors.mvds.body), Number(vectors.mvds.timestamp));
    expect(hex(syncMessageId(record))).toBe(vectors.mvds.messageId);
    expect(hex(encodeMvds({ messages: [record] }))).toBe(vectors.mvds.payload);
    expect(hex(encodeMvds({ acks: [fromHex(vectors.mvds.messageId)] }))).toBe(vectors.mvds.ack);
  });
});

describe('what status-go sends', () => {
  const me = keysOf(bob);
  const open = (payload: string) => openEnvelope(me, 'this-device', fromHex(payload))!;

  it('opens a DM end to end', () => {
    const opened = open(vectors.direct.wakuPayload);
    expect(hex(opened.signer)).toBe(alice.public);
    expect(opened.records).toHaveLength(1);
    const [record] = opened.records;
    expect(hex(record.body)).toBe(vectors.direct.amm);
    expect(hex(record.sync!.groupId)).toBe(vectors.direct.groupId);
    expect(hex(syncMessageId(record.sync!))).toBe(vectors.direct.mvdsId);
    const message = readApplication(record.body)!;
    expect(message.id).toBe(vectors.direct.messageId);
    expect(decodeChatMessage(message.payload).text).toBe('hello from status-go');
  });

  it('opens a contact request and its acceptance', () => {
    const request = readApplication(open(vectors.contactRequest.wakuPayload).records[0].body)!;
    const chat = decodeChatMessage(request.payload);
    expect(chat.contentType).toBe(ContentType.CONTACT_REQUEST);
    expect(chat.contactRequestState?.localState).toBe(RequestState.SENT);

    const accept = readApplication(open(vectors.accept.wakuPayload).records[0].body)!;
    expect(accept.type).toBe(AppType.ACCEPT_CONTACT_REQUEST);
    expect(decodeContactRequestDecision(accept.payload).id).toBe(request.id);
  });

  it('opens a reaction', () => {
    const reaction = readApplication(open(vectors.reaction.wakuPayload).records[0].body)!;
    expect(reaction.type).toBe(AppType.EMOJI_REACTION);
    expect(decodeReaction(reaction.payload)).toMatchObject({
      emoji: '👍',
      messageId: vectors.direct.messageId,
      retracted: false,
    });
  });

  it('opens an edit and a deletion, encoded byte for byte the same way here', () => {
    const edit = readApplication(open(vectors.edit.wakuPayload).records[0].body)!;
    expect(edit.type).toBe(AppType.EDIT_MESSAGE);
    const wireEdit = decodeEdit(edit.payload);
    expect(wireEdit).toMatchObject({
      text: 'hello from status-go, edited',
      chatId: bob.public,
      messageId: vectors.direct.messageId,
      messageType: MessageType.ONE_TO_ONE,
      contentType: ContentType.TEXT_PLAIN,
    });
    expect(encodeEdit(wireEdit)).toEqual(edit.payload);

    const deletion = readApplication(open(vectors.delete.wakuPayload).records[0].body)!;
    expect(deletion.type).toBe(AppType.DELETE_MESSAGE);
    const wireDelete = decodeDelete(deletion.payload);
    expect(wireDelete).toMatchObject({
      chatId: bob.public,
      messageId: vectors.contactRequest.messageId,
      messageType: MessageType.ONE_TO_ONE,
      deletedBy: '',
    });
    expect(encodeDelete(wireDelete)).toEqual(deletion.payload);
  });

  it('opens profile pictures encrypted for contacts, with the key meant for this one', () => {
    const message = readApplication(open(vectors.identity.message.wakuPayload).records[0].body)!;
    expect(message.type).toBe(AppType.CHAT_IDENTITY);
    const identity = decodeChatIdentity(message.payload);
    expect(identity.displayName).toBe('Alice');
    const large = identity.images.find((image) => image.name === 'large')!;
    expect(large).toMatchObject({ encrypted: true, format: 1 });
    const shared = sharedSecret(fromHex(bob.private), publicKeyFromParticipant(alice.public));
    const [forCarol, forBob] = large.encryptionKeys;
    expect(() => decryptNonceFirst(shared, forCarol)).toThrow();
    expect(hex(decryptNonceFirst(decryptNonceFirst(shared, forBob), large.payload))).toBe(
      vectors.identity.large
    );
  });

  it('opens a group message and replays its events', () => {
    const message = readApplication(open(vectors.group.wakuPayload).records[0].body)!;
    expect(message.type).toBe(AppType.MEMBERSHIP_UPDATE_MESSAGE);
    const update = decodeMembershipUpdate(message.payload);
    expect(update.chatId).toBe(vectors.groupEvents.chatId);
    expect(update.message?.text).toBe('hello group');
    const events = update.events.map((bytes) => readGroupEvent(update.chatId, bytes)!);
    const group = GroupState.replay(update.chatId, events)!;
    expect(group.name).toBe(vectors.groupEvents.name);
    expect([...group.members].sort()).toEqual([...vectors.groupEvents.members].sort());
    expect([...group.admins]).toEqual(vectors.groupEvents.admins);
    expect(group.creator).toBe(alice.public);
  });

  it('keeps the picture a group image event sets', () => {
    const message = readApplication(
      open(vectors.groupPicture.message.wakuPayload).records[0].body
    )!;
    const update = decodeMembershipUpdate(message.payload);
    const events = update.events.map((bytes) => readGroupEvent(update.chatId, bytes)!);
    expect(hex(GroupState.replay(update.chatId, events)!.image!)).toBe(vectors.groupPicture.image);
  });

  it('refuses a message sealed to someone else', () => {
    expect(
      openEnvelope(keysOf(carol), 'this-device', fromHex(vectors.direct.wakuPayload))
    ).toBeNull();
  });
});

describe('what this adapter sends', () => {
  it('seals a DM its recipient opens to the same message', () => {
    const sender = keysOf(alice);
    const recipient = keysOf(bob);
    const body = fromHex(vectors.amm.amm);
    const record = syncRecord(sender.publicKey, recipient.publicKey, body, 1_790_000_000);
    const [sealed] = sealEnvelope(
      sender,
      'statim-device',
      recipient.publicKey,
      encodeMvds({ messages: [record] })
    );
    const opened = openEnvelope(recipient, 'another-device', sealed)!;
    expect(opened.signer).toEqual(sender.publicKey);
    expect(opened.records[0].body).toEqual(body);
    expect(hex(syncMessageId(opened.records[0].sync!))).toBe(vectors.mvds.messageId);
  });

  it('seals acknowledgements with no message in them', () => {
    const sender = keysOf(bob);
    const recipient = keysOf(alice);
    const ack = fromHex(vectors.mvds.messageId);
    const opened = openEnvelope(
      recipient,
      ANY_INSTALLATION,
      sealEnvelope(sender, 'x', recipient.publicKey, encodeMvds({ acks: [ack] }))[0]
    )!;
    expect(opened.records).toHaveLength(0);
    expect(opened.acks).toEqual([ack]);
  });
});

describe('group events', () => {
  const chatId = vectors.groupEvents.chatId;

  it('reads the events status-go signed', () => {
    const events = vectors.groupEvents.events.map(
      (bytes) => readGroupEvent(chatId, fromHex(bytes))!
    );
    expect(events.map((event) => event.type)).toEqual([
      EventType.CHAT_CREATED,
      EventType.MEMBERS_ADDED,
    ]);
    expect(events.every((event) => event.from === alice.public)).toBe(true);
  });

  it('keeps the rules: members add, only admins remove others, anyone leaves', () => {
    const [created, addedEvent] = vectors.groupEvents.events.map(
      (bytes) => readGroupEvent(chatId, fromHex(bytes))!
    );
    const group = GroupState.replay(chatId, [created, addedEvent])!;
    const bobKeys = keysOf(bob);

    const bobRemovesCarol = signGroupEvent(
      chatId,
      { type: EventType.MEMBER_REMOVED, clock: group.lastClock + 1, members: [carol.public] },
      bobKeys
    );
    expect(group.merged([bobRemovesCarol])).toBeNull();

    const bobLeaves = signGroupEvent(
      chatId,
      { type: EventType.MEMBER_REMOVED, clock: group.lastClock + 1, members: [bob.public] },
      bobKeys
    );
    expect([...group.merged([bobLeaves])!.members]).not.toContain(bob.public);

    const bobRenames = signGroupEvent(
      chatId,
      { type: EventType.NAME_CHANGED, clock: group.lastClock + 1, name: 'Renamed' },
      bobKeys
    );
    expect(group.merged([bobRenames])!.name).toBe('Renamed');
  });

  it('rejects a log whose chat id does not name its creator', () => {
    const [created] = vectors.groupEvents.events.map(
      (bytes) => readGroupEvent(chatId, fromHex(bytes))!
    );
    expect(GroupState.replay(`${chatId.slice(0, 36)}-${bob.public}`, [created])).toBeNull();
  });
});
