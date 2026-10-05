import { changeNotes, signInURL, SignInRequired, type Container } from './cloudkit';

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
    await expect(changeNotes(CONTAINER, 'a+b/c=', [NOTE], [])).resolves.toMatchObject({
      token: 'next+/=',
    });
    expect(mockFetch.mock.calls[0][0]).toContain('&ckWebAuthToken=a%2Bb%2Fc%3D');
  });

  it('keeps the old token when the reply carries none', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { records: [] }));
    await expect(changeNotes(CONTAINER, 'same', [NOTE], [])).resolves.toMatchObject({
      token: 'same',
    });
  });

  it('saves each note under the name it chose and deletes the ones it is done with', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { records: [{ recordName: 'n1' }] }, 'next'));
    await expect(
      changeNotes(CONTAINER, 't', [{ name: 'n1', tag: 'tag1', sealed: 'abc' }], ['old1'])
    ).resolves.toEqual({ token: 'next', undeleted: [] });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/private/records/modify?');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
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
        { operationType: 'forceDelete', record: { recordName: 'old1' } },
      ],
    });
  });

  it('counts a note already gone as deleted and reports one it could not delete', async () => {
    mockFetch.mockResolvedValueOnce(
      reply(200, {
        records: [
          { recordName: 'old1', serverErrorCode: 'NOT_FOUND' },
          { recordName: 'old2', serverErrorCode: 'SERVER_REJECTED_REQUEST' },
        ],
      })
    );
    await expect(changeNotes(CONTAINER, 't', [], ['old1', 'old2'])).resolves.toEqual({
      token: 't',
      undeleted: ['old2'],
    });
  });

  it('asks for a sign-in again once the token has expired', async () => {
    mockFetch.mockResolvedValueOnce(reply(421, { serverErrorCode: 'AUTHENTICATION_REQUIRED' }));
    await expect(changeNotes(CONTAINER, 'old', [NOTE], [])).rejects.toBeInstanceOf(SignInRequired);
    mockFetch.mockResolvedValueOnce(reply(401, { serverErrorCode: 'AUTHENTICATION_FAILED' }));
    await expect(changeNotes(CONTAINER, 'old', [NOTE], [])).rejects.toBeInstanceOf(SignInRequired);
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
    await expect(changeNotes(CONTAINER, 't', [NOTE], [])).rejects.toThrow('Over quota');
  });
});
