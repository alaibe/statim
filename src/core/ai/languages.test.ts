import { deviceLanguage, findLanguage } from './languages';

it('finds a language by tag, alias or name, in any case', () => {
  expect(findLanguage('fr')?.name).toBe('French');
  expect(findLanguage('Spanish')?.tag).toBe('es');
  expect(findLanguage('jp')?.tag).toBe('ja');
  expect(findLanguage('ZH')?.tag).toBe('zh-Hans');
  expect(findLanguage('hello')).toBeNull();
});

it("uses the device's language, and English for one the translators lack", () => {
  expect(deviceLanguage('fr-FR').tag).toBe('fr');
  expect(deviceLanguage('zh-Hant-TW').tag).toBe('zh-Hant');
  expect(deviceLanguage('cy-GB').tag).toBe('en');
});
