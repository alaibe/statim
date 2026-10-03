import { mentionedIds } from '@/core/messaging/markdown';
import { mentionLink } from '@/core/messaging/mentions';
import { sha256 } from '@noble/hashes/sha2';

import { InMemoryMessageStore } from '@/core/messaging/message-store';
import { protocolChatId } from '@/core/messaging/namespace';
import type { ProtocolMessage } from '@/core/messaging/types';
import { base64ToBytes, bytesToBase64, fromHex, toHex } from '@/lib/bytes';
import { InMemoryProtocolState } from '@/storage/protocol-state';

import { reactionCode, reactionEmoji, StatusSession, type StatusMedia } from './adapter';
import { publicKeyOf } from './crypto';
import {
  openEnvelope,
  readApplication,
  sealEnvelope,
  syncRecord,
  wrapApplication,
} from './envelope';
import { STATUS_CHAT_KEY_PATH } from './keys';
import { GroupState, readGroupEvent } from './group';
import {
  AppType,
  AudioType,
  ContentType,
  decodeChatMessage,
  decodeMembershipUpdate,
  encodeDelete,
  encodeEdit,
  encodeMvds,
  EventType,
  MessageType,
} from './messages';
import { partitionedTopic } from './topics';
import { FakeStatusNetwork, type FakeStatusNode } from './testing/fake-network';
import vectors from './testing/status-go-vectors.json';
import recordings from './testing/voice-recordings.json';

type Key = (typeof vectors.keys)[number];
const [ALICE, BOB, CAROL] = vectors.keys;
const chat = protocolChatId;

class FakeMedia implements StatusMedia {
  readonly files = new Map<string, Uint8Array>();

  async save(messageId: string, bytes: Uint8Array) {
    const uri = `file:///media/${messageId}`;
    this.files.set(uri, bytes);
    return uri;
  }

  async load(uri: string) {
    const bytes = this.files.get(uri);
    if (!bytes) throw new Error(`no file at ${uri}`);
    return bytes;
  }
}

interface Peer {
  key: Key;
  session: StatusSession;
  node: FakeStatusNode;
  store: InMemoryMessageStore;
  media: FakeMedia;
  received: ProtocolMessage[];
}

async function connect(network: FakeStatusNetwork, key: Key, displayName = ''): Promise<Peer> {
  const node = network.node();
  const store = new InMemoryMessageStore();
  const media = new FakeMedia();
  const session = await StatusSession.connect({
    derive: (path) => {
      expect(path).toBe(STATUS_CHAT_KEY_PATH);
      return { path, privateKey: fromHex(key.private), publicKey: new Uint8Array(33) };
    },
    nodeUrl: 'http://node.test',
    fetchImpl: node.fetch,
    autoPoll: false,
    displayName,
    store,
    state: new InMemoryProtocolState(),
    media,
  });
  const received: ProtocolMessage[] = [];
  await session.streamMessages((message) => received.push(message));
  return { key, session, node, store, media, received };
}

const texts = (messages: ProtocolMessage[]) =>
  messages.flatMap((m) => (m.content.kind === 'text' ? [m.content.text] : []));

const keysOf = (key: Key) => ({
  privateKey: fromHex(key.private),
  publicKey: publicKeyOf(fromHex(key.private)),
});

const at = (vector: { wakuPayload: string; contentTopic: string }, ms: number) => ({
  payload: Buffer.from(fromHex(vector.wakuPayload)).toString('base64'),
  contentTopic: vector.contentTopic,
  version: 1,
  timestamp: ms * 1_000_000,
});

function forge(network: FakeStatusNetwork, from: Key, to: Key, type: number, payload: Uint8Array) {
  const sender = keysOf(from);
  const recipient = keysOf(to).publicKey;
  const application = wrapApplication(type, payload, sender).bytes;
  const record = syncRecord(
    sender.publicKey,
    recipient,
    application,
    Math.floor(Date.now() / 1_000)
  );
  for (const part of sealEnvelope(
    sender,
    'forged',
    recipient,
    encodeMvds({ messages: [record] })
  )) {
    network.publish({
      payload: bytesToBase64(part),
      contentTopic: partitionedTopic(recipient),
      version: 1,
      timestamp: Date.now() * 1_000_000,
    });
  }
}

async function befriend(a: Peer, b: Peer) {
  await a.session.createDm(b.key.public);
  await a.session.send(chat(b.key.public), { kind: 'text', text: `hi ${b.key.seed}` });
  await b.session.pollOnce();
  await b.session.setConsent(chat(a.key.public), 'accepted');
  await a.session.pollOnce();
}

describe('StatusSession', () => {
  let network: FakeStatusNetwork;
  let alice: Peer;
  let bob: Peer;

  beforeEach(async () => {
    network = new FakeStatusNetwork();
    alice = await connect(network, ALICE, 'Alice');
    bob = await connect(network, BOB, 'Bobby');
  });

  afterEach(async () => {
    await alice.session.disconnect();
    await bob.session.disconnect();
  });

  describe('identity', () => {
    it('is the Status chat key, shown the way Status shows it', () => {
      expect(alice.session.self).toEqual({
        participantId: ALICE.public,
        address: ALICE.compressedMultiformat,
      });
    });

    it('resolves pasted keys and links, and nothing else', async () => {
      await expect(
        alice.session.resolveParticipant(`https://status.app/u#${BOB.compressedMultiformat}`)
      ).resolves.toBe(BOB.public);
      await expect(alice.session.resolveParticipant('bob.stateofus.eth')).resolves.toBeNull();
      await expect(alice.session.resolveAddresses([BOB.public])).resolves.toEqual({
        [BOB.public]: BOB.compressedMultiformat,
      });
    });

    it('refuses a display name status-go would drop messages over', async () => {
      await expect(connect(network, CAROL, 'Al')).rejects.toThrow(/5 to 24/);
      await expect(connect(network, CAROL, 'carol.eth')).rejects.toThrow(/5 to 24/);
    });

    it('listens on its partitioned topic on the Status shard', () => {
      expect(alice.node.subscribed).toBe(true);
    });
  });

  describe('contact requests', () => {
    it('sends a contact request ahead of the first message, and both arrive as a request', async () => {
      const dm = await alice.session.createDm(BOB.public);
      expect(dm.consent).toBe('accepted');
      await alice.session.send(dm.id, { kind: 'text', text: 'hello, it is Alice' });
      expect((await alice.session.listChats())[0].consent).toBe('accepted');
      expect(texts(await alice.session.getMessages(dm.id))).toEqual(['hello, it is Alice']);

      const [request, message] = alice.node.published.map((published) => {
        expect(published.contentTopic).toBe(partitionedTopic(publicKeyOf(fromHex(BOB.private))));
        const opened = openEnvelope(
          { privateKey: fromHex(BOB.private), publicKey: publicKeyOf(fromHex(BOB.private)) },
          'any',
          base64ToBytes(published.payload)
        )!;
        return decodeChatMessage(readApplication(opened.records[0].body)!.payload);
      });
      expect(request).toMatchObject({ contentType: 11, text: 'Please add me to your contacts' });
      expect(request.contactRequestState?.localState).toBe(2);
      expect(message).toMatchObject({ contentType: 1, text: 'hello, it is Alice' });
      expect(message.clock).toBeGreaterThan(request.clock);

      await bob.session.pollOnce();
      const [incoming] = await bob.session.listChats();
      expect(incoming).toMatchObject({ id: ALICE.public, kind: 'dm', consent: 'request' });
      expect(texts(await bob.session.getMessages(incoming.id))).toEqual([
        'Please add me to your contacts',
        'hello, it is Alice',
      ]);
      await expect(bob.session.resolveNames([ALICE.public])).resolves.toEqual({
        [ALICE.public]: 'Alice',
      });
    });

    it('accepting makes both sides mutual, which groups need', async () => {
      await alice.session.createDm(BOB.public);
      await alice.session.send(chat(BOB.public), { kind: 'text', text: 'hi' });
      await expect(alice.session.createGroup([BOB.public], 'Too soon')).rejects.toThrow(
        /accepted your contact request/
      );

      await bob.session.pollOnce();
      await bob.session.setConsent(chat(ALICE.public), 'accepted');
      expect((await bob.session.listChats())[0].consent).toBe('accepted');
      await alice.session.pollOnce();

      const group = await alice.session.createGroup([BOB.public], 'Now');
      expect(group).toMatchObject({ kind: 'group', title: 'Now', consent: 'accepted' });
    });

    it('declining hides the chat and drops what follows', async () => {
      await alice.session.createDm(BOB.public);
      await alice.session.send(chat(BOB.public), { kind: 'text', text: 'hi' });
      await bob.session.pollOnce();
      await bob.session.setConsent(chat(ALICE.public), 'declined');
      expect(await bob.session.listChats()).toEqual([]);

      await alice.session.send(chat(BOB.public), { kind: 'text', text: 'hello?' });
      await bob.session.pollOnce();
      expect(texts(await bob.session.getMessages(chat(ALICE.public)))).toEqual([
        'Please add me to your contacts',
        'hi',
      ]);
    });

    it('blocking keeps the chat and drops what follows until it is unblocked', async () => {
      await alice.session.createDm(BOB.public);
      await alice.session.send(chat(BOB.public), { kind: 'text', text: 'hi' });
      await bob.session.pollOnce();
      await bob.session.setBlocked(chat(ALICE.public), true);
      expect(await bob.session.listChats()).toMatchObject([{ id: ALICE.public, blocked: true }]);

      await alice.session.send(chat(BOB.public), { kind: 'text', text: 'hello?' });
      await bob.session.pollOnce();
      const before = ['Please add me to your contacts', 'hi'];
      expect(texts(await bob.session.getMessages(chat(ALICE.public)))).toEqual(before);

      await bob.session.setBlocked(chat(ALICE.public), false);
      expect((await bob.session.listChats())[0].blocked).toBeUndefined();
      await alice.session.send(chat(BOB.public), { kind: 'text', text: 'there?' });
      await bob.session.pollOnce();
      expect(texts(await bob.session.getMessages(chat(ALICE.public)))).toEqual([
        ...before,
        'there?',
      ]);
    });
  });

  describe('messages', () => {
    beforeEach(() => befriend(alice, bob));

    it('keeps replies and message ids the same on both sides', async () => {
      const [first] = await bob.session.getMessages(chat(ALICE.public));
      const replyId = await bob.session.send(
        chat(ALICE.public),
        { kind: 'text', text: 'hi alice' },
        first.id
      );
      await alice.session.pollOnce();
      const reply = (await alice.session.getMessages(chat(BOB.public))).find(
        (m) => m.id === replyId
      );
      expect(reply).toMatchObject({ replyTo: first.id, senderId: BOB.public, fromMe: false });
      expect(alice.received.map((m) => m.id)).toContain(replyId);
    });

    it('sends reactions as Status code points and reads them back as emoji', async () => {
      const [first] = await bob.session.getMessages(chat(ALICE.public));
      await bob.session.send(chat(ALICE.public), {
        kind: 'reaction',
        targetId: first.id,
        emoji: '❤️',
        action: 'added',
      });
      const payload = bob.node.published.at(-1)!;
      const opened = openEnvelope(
        { privateKey: fromHex(ALICE.private), publicKey: publicKeyOf(fromHex(ALICE.private)) },
        'any',
        base64ToBytes(payload.payload)
      )!;
      expect(opened.records[0].sync).toBeUndefined();
      expect(readApplication(opened.records[0].body)!.type).toBe(AppType.EMOJI_REACTION);

      await alice.session.pollOnce();
      const reaction = alice.received.find((m) => m.content.kind === 'reaction');
      expect(reaction?.content).toEqual({
        kind: 'reaction',
        targetId: first.id,
        emoji: '❤️',
        action: 'added',
      });
    });

    it('sends and receives images inline', async () => {
      const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 1, 2, 3]);
      alice.media.files.set('file:///picked.jpg', bytes);
      await alice.session.send(chat(BOB.public), {
        kind: 'image',
        uri: 'file:///picked.jpg',
        mimeType: 'image/jpeg',
        width: 3,
        height: 2,
        caption: 'look',
      });
      await bob.session.pollOnce();
      const image = bob.received.find((m) => m.content.kind === 'image')!;
      expect(image.content).toMatchObject({ width: 3, height: 2, caption: 'look' });
      expect(bob.media.files.get((image.content as { uri: string }).uri)).toEqual(bytes);
    });

    it('splits a photo too big for one Waku message and puts it back together', async () => {
      const bytes = Uint8Array.from({ length: 250_000 }, (_, i) => (i * 13) % 256);
      alice.media.files.set('file:///big.jpg', bytes);
      const before = alice.node.published.length;
      await alice.session.send(chat(BOB.public), {
        kind: 'image',
        uri: 'file:///big.jpg',
        mimeType: 'image/jpeg',
      });
      const parts = alice.node.published.slice(before);
      expect(parts).toHaveLength(3);
      expect(parts.every((part) => base64ToBytes(part.payload).length < 150 * 1024)).toBe(true);

      await bob.session.pollOnce();
      const image = bob.received.find((m) => m.content.kind === 'image')!;
      expect(bob.media.files.get((image.content as { uri: string }).uri)).toEqual(bytes);
    });

    it('edits and deletes a message on both sides, and the chat falls back to the one before', async () => {
      const deleted: string[] = [];
      await bob.session.streamDeletedMessages((_, ids) => deleted.push(...ids));
      const id = await alice.session.send(chat(BOB.public), { kind: 'text', text: 'see you at 5' });
      await bob.session.pollOnce();

      await alice.session.editMessage(chat(BOB.public), id, 'see you at 6');
      const [record] = openEnvelope(
        keysOf(BOB),
        'any',
        base64ToBytes(alice.node.published.at(-1)!.payload)
      )!.records;
      expect(record.sync).toBeDefined();
      expect(readApplication(record.body)!.type).toBe(AppType.EDIT_MESSAGE);
      await bob.session.pollOnce();
      const edited = { id, content: { kind: 'text', text: 'see you at 6' }, edited: true };
      expect(bob.received.at(-1)).toMatchObject(edited);
      expect(await bob.session.getMessages(chat(ALICE.public))).toContainEqual(
        expect.objectContaining(edited)
      );

      await expect(bob.session.deleteMessage(chat(ALICE.public), id)).rejects.toThrow(/admins/);
      await alice.session.deleteMessage(chat(BOB.public), id);
      await bob.session.pollOnce();
      expect(deleted).toEqual([id]);
      const rest = await bob.session.getMessages(chat(ALICE.public));
      expect(rest.map((m) => m.id)).not.toContain(id);
      const dm = (await bob.session.listChats()).find((c) => c.id === ALICE.public);
      expect(dm?.lastMessage?.id).toBe(rest.at(-1)?.id);
    });

    it('sends a recorded voice note as the AAC Status plays', async () => {
      alice.media.files.set('file:///voice.m4a', base64ToBytes(recordings.iphone.input));
      await alice.session.send(chat(BOB.public), {
        kind: 'voice',
        uri: 'file:///voice.m4a',
        durationMs: 2500,
        name: 'voice.m4a',
        mimeType: 'audio/m4a',
      });
      const [record] = openEnvelope(
        keysOf(BOB),
        'any',
        base64ToBytes(alice.node.published.at(-1)!.payload)
      )!.records;
      const wire = decodeChatMessage(readApplication(record.body)!.payload);
      expect(wire).toMatchObject({
        contentType: ContentType.AUDIO,
        text: 'Update to latest version to listen to an audio message here!',
        audio: { type: AudioType.AAC, durationMs: 2500 },
      });

      await bob.session.pollOnce();
      const voice = bob.received.find((m) => m.content.kind === 'voice')!.content;
      expect(voice).toMatchObject({ durationMs: 2500, mimeType: 'audio/aac' });
      const saved = bob.media.files.get((voice as { uri: string }).uri)!;
      expect(toHex(sha256(saved))).toBe(recordings.iphone.output);
    });

    it('deletes for this device alone without sending anything', async () => {
      const [first] = await bob.session.getMessages(chat(ALICE.public));
      const sent = bob.node.published.length;
      await bob.session.deleteMessageForMe(chat(ALICE.public), first.id);
      expect(bob.node.published).toHaveLength(sent);
      expect((await bob.session.getMessages(chat(ALICE.public))).map((m) => m.id)).not.toContain(
        first.id
      );
    });

    it('acknowledges what it received so status-go stops resending', async () => {
      const before = bob.node.published.length;
      await alice.session.send(chat(BOB.public), { kind: 'text', text: 'ack me' });
      await bob.session.pollOnce();
      const acks = bob.node.published.slice(before);
      expect(acks).toHaveLength(1);
      const opened = openEnvelope(
        { privateKey: fromHex(ALICE.private), publicKey: publicKeyOf(fromHex(ALICE.private)) },
        'any',
        base64ToBytes(acks[0].payload)
      )!;
      expect(opened.records).toHaveLength(0);
      expect(opened.acks).toHaveLength(1);
    });

    it('resumes a send that failed halfway instead of sending twice', async () => {
      alice.node.down = true;
      await expect(
        alice.session.send(chat(BOB.public), { kind: 'text', text: 'flaky' })
      ).rejects.toThrow();
      alice.node.down = false;
      await alice.session.send(chat(BOB.public), { kind: 'text', text: 'flaky' });
      await bob.session.pollOnce();
      expect(texts(await bob.session.getMessages(chat(ALICE.public)))).toEqual([
        'Please add me to your contacts',
        'hi bob',
        'flaky',
      ]);
    });
  });

  describe('groups', () => {
    let carol: Peer;

    beforeEach(async () => {
      carol = await connect(network, CAROL, 'Carol');
      await befriend(alice, bob);
      await befriend(alice, carol);
    });

    afterEach(() => carol.session.disconnect());

    it('creates a group every member replays the same way', async () => {
      const group = await alice.session.createGroup([BOB.public, CAROL.public], 'Friends');
      expect(group.id.endsWith(ALICE.public)).toBe(true);
      await bob.session.pollOnce();
      await carol.session.pollOnce();

      for (const peer of [bob, carol]) {
        const seen = (await peer.session.listChats()).find((c) => c.kind === 'group')!;
        expect(seen).toMatchObject({ id: group.id, title: 'Friends', consent: 'accepted' });
        expect([...seen.memberIds].sort()).toEqual([ALICE.public, BOB.public, CAROL.public].sort());
        await expect(peer.session.getMembers(group.id)).resolves.toContainEqual({
          id: ALICE.public,
          role: 'owner',
        });
      }

      await bob.session.send(group.id, { kind: 'text', text: 'hello friends' });
      await alice.session.pollOnce();
      await carol.session.pollOnce();
      expect(texts(await alice.session.getMessages(group.id))).toContain('hello friends');
      expect(texts(await carol.session.getMessages(group.id))).toContain('hello friends');
    });

    it('renames, removes and leaves under the group rules', async () => {
      const group = await alice.session.createGroup([BOB.public, CAROL.public], 'Friends');
      await bob.session.pollOnce();
      await carol.session.pollOnce();

      await bob.session.renameGroup(group.id, 'Best friends');
      await alice.session.pollOnce();
      await carol.session.pollOnce();
      expect((await carol.session.listChats()).find((c) => c.id === group.id)?.title).toBe(
        'Best friends'
      );

      await expect(bob.session.removeMembers(group.id, [CAROL.public])).rejects.toThrow(
        /only admins/
      );
      await alice.session.removeMembers(group.id, [CAROL.public]);
      await bob.session.pollOnce();
      await carol.session.pollOnce();
      expect((await bob.session.getMembers(group.id)).map((m) => m.id)).not.toContain(CAROL.public);
      const removed = (await carol.session.listChats()).find((c) => c.id === group.id)!;
      expect(removed.canSend).toBe(false);

      await bob.session.leaveGroup(group.id);
      await alice.session.pollOnce();
      expect((await alice.session.getMembers(group.id)).map((m) => m.id)).toEqual([ALICE.public]);
      expect((await bob.session.listChats()).some((c) => c.id === group.id)).toBe(false);
    });

    it('writes mentions the way Status does and reads them back as names', async () => {
      const group = await alice.session.createGroup([BOB.public, CAROL.public], 'Friends');
      await bob.session.pollOnce();
      await carol.session.pollOnce();
      const [bobCandidate] = await alice.session.mentionCandidates(group.id, 'bo');
      expect(bobCandidate).toEqual({ id: BOB.public, name: 'Bobby' });

      await alice.session.send(group.id, {
        kind: 'text',
        text: `hi ${mentionLink(bobCandidate.name, bobCandidate.id)}!`,
      });
      const toBob = alice.node.published
        .filter((m) => m.contentTopic === partitionedTopic(keysOf(BOB).publicKey))
        .at(-1)!;
      const [record] = openEnvelope(keysOf(BOB), 'any', base64ToBytes(toBob.payload))!.records;
      const update = decodeMembershipUpdate(readApplication(record.body)!.payload);
      expect(update.message?.text).toBe(`hi @${BOB.public}!`);

      for (const peer of [bob, carol]) {
        await peer.session.pollOnce();
        const [text] = texts(await peer.session.getMessages(group.id));
        expect(mentionedIds(text)).toEqual([BOB.public]);
      }
      expect(texts(await bob.session.getMessages(group.id))).toEqual([
        `hi ${mentionLink('Bobby', BOB.public)}!`,
      ]);
    });

    it('lets admins delete what anyone wrote, and nobody else touch it', async () => {
      const group = await alice.session.createGroup([BOB.public, CAROL.public], 'Friends');
      await bob.session.pollOnce();
      await carol.session.pollOnce();
      const deletesOthers = async (peer: Peer) =>
        (await peer.session.listChats()).find((c) => c.id === group.id)?.canDeleteOthers;
      expect(await deletesOthers(alice)).toBe(true);
      expect(await deletesOthers(bob)).toBe(false);

      const id = await bob.session.send(group.id, { kind: 'text', text: 'hello friends' });
      await alice.session.pollOnce();
      await carol.session.pollOnce();
      const target = { chatId: group.id, messageId: id, messageType: MessageType.PRIVATE_GROUP };
      const edit = encodeEdit({
        ...target,
        clock: Date.now(),
        text: 'carol was here',
        contentType: ContentType.TEXT_PLAIN,
      });
      forge(network, CAROL, ALICE, AppType.EDIT_MESSAGE, edit);
      const deletion = encodeDelete({ ...target, clock: Date.now(), deletedBy: CAROL.public });
      forge(network, CAROL, ALICE, AppType.DELETE_MESSAGE, deletion);
      await alice.session.pollOnce();
      expect(texts(await alice.session.getMessages(group.id))).toEqual(['hello friends']);
      await expect(carol.session.deleteMessage(group.id, id)).rejects.toThrow(/admins/);

      await alice.session.deleteMessage(group.id, id);
      await bob.session.pollOnce();
      await carol.session.pollOnce();
      for (const peer of [alice, bob, carol]) {
        expect(await peer.session.getMessages(group.id)).toEqual([]);
      }
    });
  });

  describe('history', () => {
    it('catches up from the store on sync when it was offline', async () => {
      await alice.session.createDm(BOB.public);
      await alice.session.send(chat(BOB.public), { kind: 'text', text: 'while you were away' });
      const late = await connect(network, BOB, 'Bob again');
      await late.session.sync();
      expect(texts(await late.session.getMessages(chat(ALICE.public)))).toEqual([
        'Please add me to your contacts',
        'while you were away',
      ]);
      expect(late.node.historyQueries[0].searchParams.get('pubsubTopic')).toBe('/waku/2/rs/16/32');
      await late.session.disconnect();
    });
  });

  describe('what status-go sends', () => {
    it('reads a status-go contact request, message, reaction and group', async () => {
      const sentAt = 1_790_000_100_000;
      network.publish(at(vectors.contactRequest, sentAt));
      network.publish(at(vectors.direct, sentAt + 1));
      network.publish(at(vectors.reaction, sentAt + 2));
      network.publish(at(vectors.group, sentAt + 3));
      await bob.session.pollOnce();

      const chats = await bob.session.listChats();
      const dm = chats.find((c) => c.id === ALICE.public)!;
      expect(dm.consent).toBe('request');
      expect(texts(await bob.session.getMessages(dm.id))).toEqual([
        'hello from status-go',
        'Please add me to your contacts',
      ]);
      const reaction = bob.received.find((m) => m.content.kind === 'reaction');
      expect(reaction?.content).toMatchObject({ targetId: vectors.direct.messageId, emoji: '👍' });

      const group = chats.find((c) => c.kind === 'group')!;
      expect(group).toMatchObject({
        id: vectors.groupEvents.chatId,
        title: 'Interop',
        consent: 'request',
      });
      expect(texts(await bob.session.getMessages(group.id))).toEqual(['hello group']);

      const acks = bob.node.published.filter(
        (m) => m.contentTopic === partitionedTopic(publicKeyOf(fromHex(ALICE.private)))
      );
      const acked = acks.flatMap(
        (m) =>
          openEnvelope(
            { privateKey: fromHex(ALICE.private), publicKey: publicKeyOf(fromHex(ALICE.private)) },
            'any',
            base64ToBytes(m.payload)
          )!.acks
      );
      expect(acked.map((id) => `0x${Buffer.from(id).toString('hex')}`).sort()).toEqual(
        [
          vectors.contactRequest.mvdsId,
          vectors.direct.mvdsId,
          vectors.reaction.mvdsId,
          vectors.group.mvdsId,
        ].sort()
      );
    });

    it('applies a status-go edit and deletion, even when they arrive first', async () => {
      const sentAt = 1_790_000_100_000;
      network.publish(at(vectors.edit, sentAt));
      network.publish(at(vectors.delete, sentAt + 1));
      network.publish(at(vectors.contactRequest, sentAt + 2));
      network.publish(at(vectors.direct, sentAt + 3));
      await bob.session.pollOnce();
      const direct = {
        id: vectors.direct.messageId,
        content: { kind: 'text', text: 'hello from status-go, edited' },
        edited: true,
      };
      expect(await bob.session.getMessages(chat(ALICE.public))).toEqual([
        expect.objectContaining(direct),
      ]);

      const resent = sealEnvelope(
        keysOf(ALICE),
        'alice-installation',
        keysOf(BOB).publicKey,
        fromHex(vectors.contactRequest.mvdsPayload)
      );
      for (const part of resent) {
        network.publish({
          ...at(vectors.contactRequest, sentAt + 4),
          payload: bytesToBase64(part),
        });
      }
      await bob.session.pollOnce();
      expect(await bob.session.getMessages(chat(ALICE.public))).toEqual([
        expect.objectContaining(direct),
      ]);
    });

    it('plays a status-go voice note', async () => {
      network.publish(at(vectors.voice, 1_790_000_100_000));
      await bob.session.pollOnce();
      const [message] = await bob.session.getMessages(chat(ALICE.public));
      expect(message.content).toMatchObject({
        kind: 'voice',
        durationMs: 1500,
        mimeType: 'audio/aac',
      });
      const saved = bob.media.files.get((message.content as { uri: string }).uri)!;
      expect([...saved.subarray(0, 2)]).toEqual([0xff, 0xf1]);
    });

    it("shows a status-go contact's profile picture on the DM", async () => {
      network.publish(at(vectors.identity.message, 1_790_000_100_000));
      network.publish(at(vectors.direct, 1_790_000_100_001));
      await bob.session.pollOnce();
      const dm = (await bob.session.listChats()).find((c) => c.id === ALICE.public)!;
      expect(bob.media.files.get(dm.avatarUri!)).toEqual(fromHex(vectors.identity.large));
    });

    it("shows a status-go group's picture", async () => {
      network.publish(at(vectors.groupPicture.message, 1_790_000_100_000));
      await bob.session.pollOnce();
      const group = (await bob.session.listChats()).find((c) => c.kind === 'group')!;
      expect(bob.media.files.get(group.avatarUri!)).toEqual(fromHex(vectors.groupPicture.image));
      await expect(bob.session.getGroupInfo(group.id)).resolves.toMatchObject({
        avatarUri: group.avatarUri,
        memberCount: 3,
      });
    });

    it('joins a group it accepts, with an event status-go replays', async () => {
      network.publish(at(vectors.group, 1_790_000_100_000));
      await bob.session.pollOnce();
      const before = bob.node.published.length;
      await bob.session.setConsent(chat(vectors.groupEvents.chatId), 'accepted');

      const toAlice = bob.node.published
        .slice(before)
        .find((m) => m.contentTopic === partitionedTopic(publicKeyOf(fromHex(ALICE.private))))!;
      const opened = openEnvelope(
        { privateKey: fromHex(ALICE.private), publicKey: publicKeyOf(fromHex(ALICE.private)) },
        'any',
        base64ToBytes(toAlice.payload)
      )!;
      const update = decodeMembershipUpdate(readApplication(opened.records[0].body)!.payload);
      const events = update.events.map((bytes) => readGroupEvent(update.chatId, bytes)!);
      expect(events.at(-1)).toMatchObject({ type: EventType.MEMBER_JOINED, from: BOB.public });
      expect(GroupState.replay(update.chatId, events)).not.toBeNull();
      expect((await bob.session.listChats()).find((c) => c.kind === 'group')?.consent).toBe(
        'accepted'
      );
    });
  });
});

describe('reaction codes', () => {
  it('match what status-go stores', () => {
    expect(reactionCode('👍')).toBe('1f44d');
    expect(reactionCode('❤️')).toBe('2764');
    expect(reactionCode('👍🏽')).toBe('1f44d-1f3fd');
    expect(reactionEmoji('2764')).toBe('❤️');
    expect(reactionEmoji('1f44d-1f3fd')).toBe('👍🏽');
    expect(reactionEmoji('🙂')).toBe('🙂');
  });
});
