import { phoneLinkCode, readPhoneLink, signInWithLink } from './phone-link';

const link = {
  homeserver: 'https://mini.tail1234.ts.net:8448',
  userId: '@me:statim',
  loginToken: 'one-time',
  expiresInMs: 120_000,
};

describe('the code a computer shows a phone', () => {
  it('reads back what the computer wrote, without its lifetime', () => {
    expect(readPhoneLink(phoneLinkCode(link))).toEqual({ ...link, expiresInMs: 0 });
  });

  it('ignores codes that are not from Statim or point anywhere but an HTTPS server', () => {
    const code = (fields: Record<string, unknown>) =>
      JSON.stringify({ ...JSON.parse(phoneLinkCode(link)), ...fields });
    for (const scanned of [
      'wc:abc@2',
      'null',
      code({ kind: 'other' }),
      code({ homeserver: 'http://mini.tail1234.ts.net:8448' }),
      code({ homeserver: 'https://mini.tail1234.ts.net:8448/path' }),
      code({ userId: 'me' }),
      code({ loginToken: 7 }),
    ]) {
      expect(readPhoneLink(scanned)).toBeNull();
    }
  });
});

describe('signing in with the code', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('trades the token for a session of its own on that server', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access', user_id: '@me:statim', device_id: 'PHONE' }),
    });
    expect(await signInWithLink(link, 'Statim')).toEqual({
      accessToken: 'access',
      userId: '@me:statim',
      deviceId: 'PHONE',
      homeserverUrl: link.homeserver,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mini.tail1234.ts.net:8448/_matrix/client/v3/login');
    expect(JSON.parse(init.body)).toEqual({
      type: 'm.login.token',
      token: 'one-time',
      initial_device_display_name: 'Statim',
    });
  });

  it('says what the server said when it refuses a used or expired token', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ errcode: 'M_FORBIDDEN', error: 'Invalid login token' }),
    });
    await expect(signInWithLink(link, 'Statim')).rejects.toThrow(
      'The computer did not accept the code: Invalid login token'
    );
  });
});
