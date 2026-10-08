import { Homeserver } from './homeserver';
import { lacksOf, RoomFeatureStore } from './room-features';

const answer = (rooms: Record<string, object>) =>
  jest.fn(async () => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        rooms: Object.fromEntries(
          Object.entries(rooms).map(([id, content]) => [
            id,
            { required_state: [{ type: 'com.beeper.room_features', state_key: 'b', content }] },
          ])
        ),
      }),
  }));

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe('lacksOf', () => {
  it('reads what mautrix-meta says of an Instagram DM', () => {
    expect(
      lacksOf({
        edit: 2,
        delete: 2,
        reply: 2,
        reaction: 2,
        file: { 'm.image': {}, 'm.video': {}, 'm.file': {} },
      })
    ).toEqual(['poll', 'thread', 'pin']);
  });

  it('reads what mautrix-slack says of a channel', () => {
    expect(
      lacksOf({
        thread: 2,
        edit: 2,
        delete: 2,
        reaction: 2,
        state: { 'm.room.name': { level: 2 } },
        member_actions: { invite: 2, kick: -2 },
        file: { 'm.image': {}, 'm.video': {} },
      })
    ).toEqual(['poll', 'reply', 'pin', 'remove', 'ban']);
  });

  it('counts a fallback as lacking and partial support as there', () => {
    expect(lacksOf({ edit: 0, delete: 1, poll: 1, thread: 1, reply: 1, reaction: -1 })).toEqual([
      'edit',
      'react',
      'pin',
      'images',
      'video',
    ]);
  });
});

describe('RoomFeatureStore', () => {
  const homeserver = new Homeserver('https://example.org', 'token');

  it('asks about the rooms that appear together in one request, once', async () => {
    const fetchMock = answer({ '!a:x': { edit: 2 } });
    global.fetch = fetchMock as unknown as typeof fetch;
    const changed: string[] = [];
    const store = new RoomFeatureStore(
      () => homeserver,
      (id) => changed.push(id)
    );

    expect(store.lacks('!a:x')).toBeUndefined();
    expect(store.lacks('!b:x')).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(changed).toEqual(['!a:x']);
    expect(store.lacks('!a:x')).toContain('delete');
    expect(store.lacks('!b:x')).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again later when there was no session to ask with', async () => {
    const fetchMock = answer({});
    global.fetch = fetchMock as unknown as typeof fetch;
    let signedIn = false;
    const store = new RoomFeatureStore(
      () => (signedIn ? homeserver : null),
      () => {}
    );

    store.lacks('!a:x');
    await new Promise((resolve) => setTimeout(resolve, 0));
    signedIn = true;
    store.lacks('!a:x');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
