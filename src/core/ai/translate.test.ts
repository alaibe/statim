import { translateOnDevice } from './device';
import { AiError } from './errors';
import { findLanguage } from './languages';
import { resolveProvider } from './providers';
import { translateText } from './translate';

jest.mock('./device', () => ({
  DEVICE_TRANSLATOR_NAME: 'Apple Translation',
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
