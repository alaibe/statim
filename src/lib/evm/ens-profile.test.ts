import { clearEnsCache, forgetEns, hydrateEnsCache } from './ens-cache';
import { resolveEnsProfile } from './ens-profile';
import { lookupName } from './ens';
import { publicClientFor } from './chains';

jest.mock('./ens', () => ({ lookupName: jest.fn() }));
jest.mock('./chains', () => ({ publicClientFor: jest.fn() }));

const mockLookup = lookupName as jest.MockedFunction<typeof lookupName>;
const mockClientFor = publicClientFor as jest.MockedFunction<typeof publicClientFor>;

const ADDRESS = '0x1111111111111111111111111111111111111111' as const;

function client(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    // Expiry lives on the registrar, so it is a contract read rather than a
    // resolver call.
    readContract: jest.fn(async () => 1893456000n), // 2030-01-01
    getEnsAvatar: jest.fn(async () => 'https://example.com/a.png'),
    getEnsText: jest.fn(async ({ key }: { key: string }) =>
      key === 'description' ? 'builder' : 'https://example.com'
    ),
    ...overrides,
  };
}

beforeEach(() => {
  clearEnsCache();
  jest.clearAllMocks();
  mockClientFor.mockReturnValue(client() as never);
});

describe('resolveEnsProfile', () => {
  it('returns the name, avatar and text records', async () => {
    mockLookup.mockResolvedValue('alice.eth');

    expect(await resolveEnsProfile(ADDRESS)).toEqual({
      name: 'alice.eth',
      avatar: 'https://example.com/a.png',
      description: 'builder',
      url: 'https://example.com',
      paidUntil: new Date(1893456000 * 1000),
    });
  });

  it('returns null when the address has no primary name', async () => {
    mockLookup.mockResolvedValue(null);
    expect(await resolveEnsProfile(ADDRESS)).toBeNull();
  });

  it('never asks for records when there is no name', async () => {
    mockLookup.mockResolvedValue(null);
    const c = client();
    mockClientFor.mockReturnValue(c as never);

    await resolveEnsProfile(ADDRESS);

    expect(c.getEnsAvatar).not.toHaveBeenCalled();
    expect(c.getEnsText).not.toHaveBeenCalled();
  });

  it('caches the miss, which is the common case', async () => {
    mockLookup.mockResolvedValue(null);

    await resolveEnsProfile(ADDRESS);
    await resolveEnsProfile(ADDRESS);

    expect(mockLookup).toHaveBeenCalledTimes(1);
  });

  it('keeps the name when a record lookup fails', async () => {
    mockLookup.mockResolvedValue('alice.eth');
    mockClientFor.mockReturnValue(
      client({
        getEnsAvatar: jest.fn(async () => {
          throw new Error('gateway down');
        }),
      }) as never
    );

    const profile = await resolveEnsProfile(ADDRESS);

    expect(profile?.name).toBe('alice.eth');
    expect(profile?.avatar).toBeNull();
  });

  it('does not cache a resolver outage', async () => {
    mockLookup.mockRejectedValueOnce(new Error('rpc down'));
    expect(await resolveEnsProfile(ADDRESS)).toBeNull();

    mockLookup.mockResolvedValue('alice.eth');
    expect((await resolveEnsProfile(ADDRESS))?.name).toBe('alice.eth');
  });

  it('is case-insensitive about the address', async () => {
    mockLookup.mockResolvedValue('alice.eth');

    await resolveEnsProfile(ADDRESS);
    await resolveEnsProfile(ADDRESS.toUpperCase() as typeof ADDRESS);

    expect(mockLookup).toHaveBeenCalledTimes(1);
  });
});

describe('across launches', () => {
  function fakeStorage() {
    const store = new Map<string, unknown>();
    return {
      get: jest.fn(async (name: string) => (store.get(name) ?? null) as never),
      set: jest.fn(async (name: string, value: unknown) => {
        store.set(name, JSON.parse(JSON.stringify(value)));
      }),
    };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('answers from the saved profile, date included, without asking the chain', async () => {
    jest.useFakeTimers();
    const storage = fakeStorage();
    await hydrateEnsCache(storage);
    mockLookup.mockResolvedValue('alice.eth');
    const first = await resolveEnsProfile(ADDRESS);
    jest.runAllTimers();

    clearEnsCache();
    await hydrateEnsCache(storage);
    const again = await resolveEnsProfile(ADDRESS);

    expect(again).toEqual(first);
    expect(again?.paidUntil).toBeInstanceOf(Date);
    expect(mockLookup).toHaveBeenCalledTimes(1);
  });

  it('asks again once the owner went to change the name', async () => {
    mockLookup.mockResolvedValue(null);
    await resolveEnsProfile(ADDRESS);

    forgetEns(ADDRESS.toUpperCase());
    mockLookup.mockResolvedValue('alice.eth');

    expect((await resolveEnsProfile(ADDRESS))?.name).toBe('alice.eth');
  });
});

describe('onchain proof', () => {
  it('reports when the name is paid up to', async () => {
    mockLookup.mockResolvedValue('alice.eth');
    const profile = await resolveEnsProfile(ADDRESS);

    expect(profile?.paidUntil?.getFullYear()).toBe(2030);
  });

  it('leaves it unset for a name the registrar does not own', async () => {
    // Subnames and other TLDs are not `.eth` second-level registrations.
    mockLookup.mockResolvedValue('team.alice.eth');
    const profile = await resolveEnsProfile(ADDRESS);

    expect(profile?.name).toBe('team.alice.eth');
    expect(profile?.paidUntil).toBeNull();
  });
});
