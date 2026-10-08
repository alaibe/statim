import { StatusNode } from './node';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

it('calls fetch on its own, since a webview refuses window.fetch on anything else', async () => {
  const fetchMock = jest.fn(async () => new Response('{}'));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  await new StatusNode({ nodeUrl: 'http://127.0.0.1:8645' }).info();

  expect(fetchMock.mock.contexts).toEqual([undefined]);
});
