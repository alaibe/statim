import * as SecureStore from 'expo-secure-store';
import { readCredential, writeCredential } from '@/core/account/credentials';
import { accountAiConfigKey, vaultGet } from '@/storage/vault';
import { loadAiConfig, saveAiConfig, saveAiKey } from './config';

const keychain = SecureStore as unknown as { __reset(): void };
beforeEach(() => keychain.__reset());

it('keeps suggestions off by default and persists the choice without storing keys in the config', async () => {
  expect((await loadAiConfig('a')).suggestOnOpen).toBeUndefined();
  const draft = {
    source: 'openai' as const,
    url: ' https://example.com/v1 ',
    model: ' model ',
    suggestOnOpen: true,
    key: 'model-secret',
    typesafeKey: 'jev-secret',
  };
  await saveAiKey('a', draft.key);
  await writeCredential('a', 'typesafe', draft.typesafeKey);
  await saveAiConfig('a', draft);
  expect(await loadAiConfig('a')).toEqual({
    source: 'openai',
    url: 'https://example.com/v1',
    model: 'model',
    suggestOnOpen: true,
    replyBadges: false,
    followUps: false,
    suggestActions: false,
  });
  expect(await vaultGet(accountAiConfigKey('a'))).not.toContain('secret');
  expect(await readCredential('a', 'ai')).toBe('model-secret');
  expect(await readCredential('a', 'typesafe')).toBe('jev-secret');
  expect(await readCredential('b', 'typesafe')).toBeNull();
  await writeCredential('a', 'typesafe', '');
  expect(await readCredential('a', 'ai')).toBe('model-secret');
  expect(await readCredential('a', 'typesafe')).toBeNull();
});
