import { anthropicProvider } from './anthropic';
import { aiFetch } from './http';

jest.mock('./http', () => ({ aiFetch: jest.fn() }));

const fetchMock = aiFetch as jest.MockedFunction<typeof aiFetch>;

function answer(body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => fetchMock.mockReset());

it('sends the Messages API shape and joins the text blocks', async () => {
  answer({ content: [{ type: 'text', text: 'Bonjour' }], stop_reason: 'end_turn' });
  const provider = anthropicProvider({ key: 'k', model: 'claude-opus-5-5', url: '' });

  await expect(
    provider.complete({ instructions: 'Translate', prompt: 'Hello', maxAnswerTokens: 100 })
  ).resolves.toBe('Bonjour');
  const [url, init] = fetchMock.mock.calls[0];
  const headers = init?.headers as Record<string, string>;
  expect(url).toBe('https://api.anthropic.com/v1/messages');
  expect(headers['x-api-key']).toBe('k');
  expect(headers['anthropic-version']).toBe('2023-06-01');
  expect(JSON.parse(String(init?.body))).toMatchObject({
    model: 'claude-opus-5-5',
    system: 'Translate',
    messages: [{ role: 'user', content: 'Hello' }],
  });
});

it('asks for a server-side fallback only on models that take one', async () => {
  answer({ content: [{ type: 'text', text: 'ok' }] });
  answer({ content: [{ type: 'text', text: 'ok' }] });
  await anthropicProvider({ key: 'k', model: 'claude-opus-5-5', url: '' }).complete({
    instructions: '',
    prompt: '',
    maxAnswerTokens: 100,
  });
  await anthropicProvider({ key: 'k', model: 'claude-haiku-4-5', url: '' }).complete({
    instructions: '',
    prompt: '',
    maxAnswerTokens: 100,
  });

  const [opus, haiku] = fetchMock.mock.calls.map(([, init]) => ({
    beta: (init?.headers as Record<string, string>)['anthropic-beta'],
    body: JSON.parse(String(init?.body)),
  }));
  expect(opus.beta).toBe('server-side-fallback-2026-07-01');
  expect(opus.body.fallbacks).toBe('default');
  expect(haiku.beta).toBeUndefined();
  expect(haiku.body.fallbacks).toBeUndefined();
});

it('reports a refusal instead of an empty answer', async () => {
  answer({ content: [], stop_reason: 'refusal' });
  const provider = anthropicProvider({ key: 'k', model: 'claude-opus-5-5', url: '' });
  await expect(
    provider.complete({ instructions: '', prompt: '', maxAnswerTokens: 100 })
  ).rejects.toMatchObject({
    code: 'refused',
  });
});
