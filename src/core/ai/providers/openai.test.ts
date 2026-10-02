import { aiFetch } from './http';
import { apiRoot, listModels, openAiProvider, stripThinking } from './openai';

jest.mock('./http', () => ({ aiFetch: jest.fn() }));

const fetchMock = aiFetch as jest.MockedFunction<typeof aiFetch>;

function answer(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  );
}

beforeEach(() => fetchMock.mockReset());

describe('apiRoot', () => {
  it('adds /v1 to a bare host, and keeps a path the user typed', () => {
    expect(apiRoot('http://100.79.145.65:8080/')).toBe('http://100.79.145.65:8080/v1');
    expect(apiRoot('localhost:11434')).toBe('http://localhost:11434/v1');
    expect(apiRoot('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1');
  });
});

describe('openAiProvider', () => {
  const provider = openAiProvider({ url: 'http://box:8080', model: 'task', key: 'sk-1' });

  it('posts instructions as the system message and labels answers with model and host', async () => {
    answer(200, { choices: [{ message: { content: 'Hello there' } }] });

    await expect(
      provider.complete({ instructions: 'Be kind', prompt: 'hi', maxAnswerTokens: 100 })
    ).resolves.toBe('Hello there');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://box:8080/v1/chat/completions');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-1');
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'task',
      messages: [
        { role: 'system', content: 'Be kind' },
        { role: 'user', content: 'hi' },
      ],
    });
    expect(provider.label).toBe('task · box:8080');
  });

  it('reads the answer, not the reasoning a thinking model sends beside it', async () => {
    answer(200, {
      choices: [{ message: { content: '<think>hmm</think>\nSure.', reasoning_content: 'long' } }],
    });
    await expect(
      provider.complete({ instructions: '', prompt: '', maxAnswerTokens: 100 })
    ).resolves.toBe('Sure.');
  });

  it('says when a reasoning model used up its room before answering', async () => {
    answer(200, { choices: [{ message: { content: '' }, finish_reason: 'length' }] });
    await expect(
      provider.complete({ instructions: '', prompt: '', maxAnswerTokens: 100 })
    ).rejects.toThrow('ran out of room');
  });

  it('turns a rejected key into a sentence', async () => {
    answer(401, { error: { message: 'bad key' } });
    await expect(
      provider.complete({ instructions: '', prompt: '', maxAnswerTokens: 100 })
    ).rejects.toThrow('box:8080 did not accept the API key.');
  });
});

it('lists model ids, and sends no key when there is none', async () => {
  answer(200, { data: [{ id: 'task' }, { id: 'embed' }, { nope: true }] });
  await expect(listModels('http://box:8080', null)).resolves.toEqual(['task', 'embed']);
  const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
  expect(headers.Authorization).toBeUndefined();
});

it('strips every inline thinking block', () => {
  expect(stripThinking('<think>a</think>One<think>b</think> two')).toBe('One two');
});
