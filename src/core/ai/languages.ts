export interface Language {
  /** BCP 47, as Apple's Translation framework and ML Kit take it. */
  readonly tag: string;
  readonly name: string;
}

const ENGLISH: Language = { tag: 'en', name: 'English' };

/** The languages both on-device translators carry. */
export const LANGUAGES: readonly Language[] = [
  { tag: 'ar', name: 'Arabic' },
  { tag: 'zh-Hans', name: 'Chinese' },
  { tag: 'zh-Hant', name: 'Traditional Chinese' },
  { tag: 'nl', name: 'Dutch' },
  ENGLISH,
  { tag: 'fr', name: 'French' },
  { tag: 'de', name: 'German' },
  { tag: 'hi', name: 'Hindi' },
  { tag: 'id', name: 'Indonesian' },
  { tag: 'it', name: 'Italian' },
  { tag: 'ja', name: 'Japanese' },
  { tag: 'ko', name: 'Korean' },
  { tag: 'pl', name: 'Polish' },
  { tag: 'pt', name: 'Portuguese' },
  { tag: 'ru', name: 'Russian' },
  { tag: 'es', name: 'Spanish' },
  { tag: 'th', name: 'Thai' },
  { tag: 'tr', name: 'Turkish' },
  { tag: 'uk', name: 'Ukrainian' },
  { tag: 'vi', name: 'Vietnamese' },
];

const ALIASES: Record<string, string> = {
  zh: 'zh-Hans',
  cn: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'pt-br': 'pt',
  'pt-pt': 'pt',
  'en-us': 'en',
  'en-gb': 'en',
  jp: 'ja',
  kr: 'ko',
  ua: 'uk',
};

export function findLanguage(word: string): Language | null {
  const key = word.trim().toLowerCase();
  if (!key) return null;
  const tag = ALIASES[key] ?? key;
  return (
    LANGUAGES.find((l) => l.tag.toLowerCase() === tag.toLowerCase()) ??
    LANGUAGES.find((l) => l.name.toLowerCase() === key) ??
    null
  );
}

/** The device's language, or English when it is not one the translators carry. */
export function deviceLanguage(locale = Intl.DateTimeFormat().resolvedOptions().locale): Language {
  const [base, region] = locale.split('-');
  return (region && findLanguage(`${base}-${region}`)) || findLanguage(base) || ENGLISH;
}
