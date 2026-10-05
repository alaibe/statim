import { loginWithToken } from './token-login';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

describe('signing in with a login token', () => {
  it('trades the token for a session of its own on that server', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access', user_id: '@me:statim', device_id: 'PHONE' }),
    });
    expect(await loginWithToken('https://mini.ts.net:8448', 'one-time', 'Statim')).toEqual({
      accessToken: 'access',
      userId: '@me:statim',
      deviceId: 'PHONE',
      homeserverUrl: 'https://mini.ts.net:8448',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mini.ts.net:8448/_matrix/client/v3/login');
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
    await expect(loginWithToken('https://mini.ts.net:8448', 'spent', 'Statim')).rejects.toThrow(
      'The homeserver did not accept the code: Invalid login token'
    );
  });
});
