import { appFetch } from '@/lib/http';
import { needsReply } from './reply-decision';

jest.mock('@/lib/http', () => ({ appFetch: jest.fn() }));
const fetchMock = jest.mocked(appFetch);

beforeEach(() => fetchMock.mockReset());

const lines = [{ from: 'Ann', fromMe: false, text: 'Are you coming?', described: false }];

it.each([
  [0.9, true],
  [0.7, true],
  [0.69, false],
  [0, false],
])('gates suggestions at probability %s', async (noul, expected) => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ answers: { reply_needed: { type: 'noul', noul } } }))
  );
  await expect(needsReply(lines, 'jev-key')).resolves.toBe(expected);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.typesafe.ai/v1/systemone');
  expect(init?.headers).toMatchObject({ Authorization: 'Bearer jev-key' });
  expect(JSON.parse(String(init?.body))).toMatchObject({
    model: 'jev-latest',
    state: 'Ann: Are you coming?',
    questions: { reply_needed: { type: 'noul' } },
  });
});

it.each([
  null,
  {},
  { type: 'noul', noul: 'true' },
  { type: 'choice', noul: 1 },
  { type: 'noul', noul: 2 },
])('rejects malformed decisions: %j', async (answer) => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ answers: { reply_needed: answer } }))
  );
  await expect(needsReply(lines, 'key')).rejects.toThrow('invalid reply decision');
});

it('reports rejected keys without exposing them', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
  await expect(needsReply(lines, 'secret')).rejects.toThrow(
    'api.typesafe.ai did not accept the API key'
  );
});
