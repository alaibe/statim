import { saveNotes, signInURL, SignInRequired, type Container } from './cloudkit';

const mockFetch = jest.fn();
jest.mock('@/lib/http', () => ({ appFetch: (...args: unknown[]) => mockFetch(...args) }));

const CONTAINER: Container = {
  id: 'iCloud.im.statim.app',
  environment: 'development',
  apiToken: 'api-token',
};

function reply(status: number, body: object, token?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: {
      get: (name: string) => (name === 'X-Apple-CloudKit-Web-Auth-Token' ? (token ?? null) : null),
    },
  };
}

const NOTE = { name: 'n', tag: 't', sealed: 's' };

beforeEach(() => mockFetch.mockReset());

describe('CloudKit web services', () => {
  it('finds where to sign in from the error a signed-out request gets', async () => {
    mockFetch.mockResolvedValueOnce(
      reply(421, {
        serverErrorCode: 'AUTHENTICATION_REQUIRED',
        redirectURL: 'https://idmsa.apple.com/sign-in',
      })
    );
    await expect(signInURL(CONTAINER)).resolves.toBe('https://idmsa.apple.com/sign-in');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.apple-cloudkit.com/database/1/iCloud.im.statim.app/development/private/users/current?ckAPIToken=api-token'
    );
  });

  it('sends the token encoded and keeps the one the reply hands back', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { records: [] }, 'next+/='));
    await expect(saveNotes(CONTAINER, 'a+b/c=', [NOTE])).resolves.toBe('next+/=');
    expect(mockFetch.mock.calls[0][0]).toContain('&ckWebAuthToken=a%2Bb%2Fc%3D');
  });

  it('keeps the old token when the reply carries none', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { records: [] }));
    await expect(saveNotes(CONTAINER, 'same', [NOTE])).resolves.toBe('same');
  });

  it('saves each note in the zone the iPhone watches, under the name it chose', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { records: [{ recordName: 'n1' }] }, 'next'));
    await expect(
      saveNotes(CONTAINER, 't', [{ name: 'n1', tag: 'tag1', sealed: 'abc' }])
    ).resolves.toBe('next');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/private/records/modify?');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      zoneID: { zoneName: 'notes' },
      atomic: false,
      operations: [
        {
          operationType: 'create',
          record: {
            recordName: 'n1',
            recordType: 'Note',
            fields: { tag: { value: 'tag1' }, sealed: { value: 'abc' } },
          },
        },
      ],
    });
  });

  it('drops the notes when no iPhone has made the zone it watches', async () => {
    mockFetch.mockResolvedValueOnce(
      reply(200, { records: [{ recordName: 'n', serverErrorCode: 'ZONE_NOT_FOUND' }] }, 'next')
    );
    await expect(saveNotes(CONTAINER, 't', [NOTE])).resolves.toBe('next');
    mockFetch.mockResolvedValueOnce(reply(404, { serverErrorCode: 'ZONE_NOT_FOUND' }));
    await expect(saveNotes(CONTAINER, 't', [NOTE])).resolves.toBe('t');
  });

  it('asks for a sign-in again once the token has expired', async () => {
    mockFetch.mockResolvedValueOnce(reply(421, { serverErrorCode: 'AUTHENTICATION_REQUIRED' }));
    await expect(saveNotes(CONTAINER, 'old', [NOTE])).rejects.toBeInstanceOf(SignInRequired);
    mockFetch.mockResolvedValueOnce(reply(401, { serverErrorCode: 'AUTHENTICATION_FAILED' }));
    await expect(saveNotes(CONTAINER, 'old', [NOTE])).rejects.toBeInstanceOf(SignInRequired);
  });

  it('says so when the build’s API token is wrong, which no sign-in fixes', async () => {
    mockFetch.mockResolvedValueOnce(
      reply(401, {
        serverErrorCode: 'AUTHENTICATION_FAILED',
        reason:
          'Authentication failed, please check you have the correct API Token for this container',
      })
    );
    await expect(signInURL(CONTAINER)).rejects.toThrow('correct API Token');
  });

  it('fails when a new note is refused', async () => {
    mockFetch.mockResolvedValueOnce(
      reply(200, {
        records: [{ recordName: 'n', serverErrorCode: 'QUOTA_EXCEEDED', reason: 'Over quota' }],
      })
    );
    await expect(saveNotes(CONTAINER, 't', [NOTE])).rejects.toThrow('Over quota');
  });
});
