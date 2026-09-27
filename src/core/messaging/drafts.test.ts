import { DraftSync, draftKey, flushDrafts, saveDraftsSoon, withDraft } from './drafts';
import { asChatId } from './testing/ids';

const C = asChatId('c');
const A = draftKey(asChatId('a'));
const B = draftKey(asChatId('b'));

describe('drafts', () => {
  it('keeps a draft per chat and drops an empty one', () => {
    const drafts = withDraft(withDraft({}, A, 'hello'), B, 'world');
    expect(withDraft(drafts, A, '')).toEqual({ [B]: 'world' });
  });

  it('writes once typing pauses, with the latest drafts', () => {
    jest.useFakeTimers();
    const set = jest.fn(async () => {});
    const storage = { set } as never;
    saveDraftsSoon(storage, { [A]: 'h' });
    saveDraftsSoon(storage, { [A]: 'hi' });
    expect(set).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('chat.drafts', { [A]: 'hi' });
    jest.useRealTimers();
  });

  it('writes the pending drafts of one account before saving another', async () => {
    jest.useFakeTimers();
    const first = jest.fn(async () => {});
    const second = jest.fn(async () => {});
    saveDraftsSoon({ set: first } as never, { [A]: 'one' });
    saveDraftsSoon({ set: second } as never, { [B]: 'two' });
    expect(first).toHaveBeenCalledWith('chat.drafts', { [A]: 'one' });
    await flushDrafts();
    expect(second).toHaveBeenCalledWith('chat.drafts', { [B]: 'two' });
    jest.useRealTimers();
  });
});

describe('DraftSync', () => {
  afterEach(() => jest.useRealTimers());

  it('saves on the protocol once typing pauses, and ignores its own echo', () => {
    jest.useFakeTimers();
    const sync = new DraftSync();
    const push = jest.fn(async () => {});
    sync.typed(C, 'h', push);
    sync.typed(C, 'hi', push);
    jest.runAllTimers();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('hi');
    expect(sync.received(C, 'hi', 'hi')).toBeUndefined();
  });

  it('takes a draft typed on another device only while ours is unchanged', () => {
    const sync = new DraftSync();
    expect(sync.received(C, 'from phone', '')).toBe('from phone');
    expect(sync.received(C, 'edited on phone', 'from phone')).toBe('edited on phone');
    expect(sync.received(C, 'again', 'mine now')).toBeUndefined();
  });

  it('keeps what is being typed here', () => {
    jest.useFakeTimers();
    const sync = new DraftSync();
    sync.typed(C, 'typing', async () => {});
    expect(sync.received(C, 'elsewhere', 'typing')).toBeUndefined();
  });
});
