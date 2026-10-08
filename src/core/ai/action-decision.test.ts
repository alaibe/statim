import { appFetch } from '@/lib/http';
import { usefulAction } from './action-decision';

jest.mock('@/lib/http', () => ({ appFetch: jest.fn() }));
const fetchMock = jest.mocked(appFetch);
const lines = [{ from: 'Ann', fromMe: false, text: 'Bonjour !', described: false }];
const language = { tag: 'en', name: 'English' };
beforeEach(() => fetchMock.mockReset());

it.each([
  ['translate', 0.9, 'translate'],
  ['summarize', 0.7, 'summarize'],
  ['none', 1, null],
  ['translate', 0.69, null],
])('recommends %s only with a clear decision (%s)', async (choice, confidence, expected) => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ answers: { action: { type: 'choice', choice, confidence } } }))
  );
  await expect(usefulAction(lines, 'key', language)).resolves.toBe(expected);
  const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(request.questions.action.instructions).toContain('English');
  expect(request.state).toBe('Ann: Bonjour !');
});

it.each([
  null,
  { type: 'choice', choice: 'send', confidence: 1 },
  { type: 'choice', choice: 'translate', confidence: 2 },
])('rejects malformed decisions: %j', async (answer) => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ answers: { action: answer } })));
  await expect(usefulAction(lines, 'key', language)).rejects.toThrow('invalid action decision');
});
