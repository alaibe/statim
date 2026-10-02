import { translateOnDevice } from './device';
import { AiError } from './errors';
import { findLanguage } from './languages';
import { resolveProvider } from './providers';
import { translateText } from './translate';

jest.mock('./device', () => ({
  DEVICE_TRANSLATION_LABEL: 'Apple Translation · on-device',
  DEVICE_TRANSLATION_SETTINGS: 'Settings › Apps › Translate › Downloaded Languages',
  translateOnDevice: jest.fn(),
}));
jest.mock('./providers', () => ({ resolveProvider: jest.fn() }));

const onDevice = translateOnDevice as jest.MockedFunction<typeof translateOnDevice>;
const resolve = resolveProvider as jest.MockedFunction<typeof resolveProvider>;
const french = findLanguage('fr')!;

beforeEach(() => jest.clearAllMocks());

it("uses the device's translator first", async () => {
  onDevice.mockResolvedValueOnce('Bonjour');
  await expect(translateText('a', 'Hello', french)).resolves.toEqual({
    text: 'Bonjour',
    label: 'Apple Translation · on-device',
  });
  expect(resolve).not.toHaveBeenCalled();
});

it('falls back to the model, with the text marked as data', async () => {
  onDevice.mockRejectedValueOnce(new AiError('language-missing', 'missing'));
  const complete = jest.fn().mockResolvedValue('Bonjour');
  resolve.mockResolvedValueOnce({
    ok: true,
    provider: { label: 'task · box', onDevice: false, maxInputChars: 1000, complete },
  });

  await expect(translateText('a', 'Can you come?', french)).resolves.toEqual({
    text: 'Bonjour',
    label: 'task · box',
  });
  expect(complete.mock.calls[0][0].instructions).toContain('a question stays a question');
  expect(complete.mock.calls[0][0].prompt).toBe('<text>\nCan you come?\n</text>');
});

it('says where to download a missing language when there is no model either', async () => {
  onDevice.mockRejectedValueOnce(new AiError('language-missing', 'missing'));
  resolve.mockResolvedValueOnce({ ok: false, reason: 'no model' });
  await expect(translateText('a', 'Hello', french)).rejects.toThrow(
    'Download French in Settings › Apps › Translate › Downloaded Languages'
  );
});

it('keeps links, addresses and code out of the translator', async () => {
  onDevice.mockImplementationOnce(async (text) =>
    text.replace('Go to', 'Allez sur').replace('send to', 'envoyer à')
  );
  const text = 'Go to https://statim.laibe.cc/ and send to 0x4c7a1e0b9d3f2a6e, `npm test`';
  await expect(translateText('a', text, french)).resolves.toEqual({
    text: 'Allez sur https://statim.laibe.cc/ and envoyer à 0x4c7a1e0b9d3f2a6e, `npm test`',
    label: 'Apple Translation · on-device',
  });
  expect(onDevice.mock.calls[0][0]).toBe('Go to {0} and send to {1}, {2}');
});

it('translates the text as it is when the translator drops a placeholder', async () => {
  onDevice.mockResolvedValueOnce('Allez sur le site').mockResolvedValueOnce('Allez sur le lien');
  await expect(translateText('a', 'Go to https://a.example', french)).resolves.toMatchObject({
    text: 'Allez sur le lien',
  });
  expect(onDevice.mock.calls[1][0]).toBe('Go to https://a.example');
});
