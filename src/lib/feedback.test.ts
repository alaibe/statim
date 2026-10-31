import { feedbackUrl } from './feedback';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3' } },
}));

const fields = (url: string) => Object.fromEntries(new URL(url).searchParams);

test('a problem opens the bug report form with the version and platform filled in', () => {
  const url = feedbackUrl('problem', { version: '0.7.8', platform: 'Android 16' });

  expect(url.startsWith('https://github.com/alaibe/statim/issues/new?')).toBe(true);
  expect(fields(url)).toStrictEqual({
    template: 'bug_report.yml',
    version: '0.7.8',
    platform: 'Android 16',
  });
});

test('a suggestion opens the feature request form', () => {
  expect(fields(feedbackUrl('feature', { version: '0.7.8', platform: 'macOS' }))).toStrictEqual({
    template: 'feature_request.yml',
    version: '0.7.8',
    platform: 'macOS',
  });
});

test('an unknown version is left for the reporter to fill in', () => {
  expect(fields(feedbackUrl('problem', { platform: 'Linux' }))).toStrictEqual({
    template: 'bug_report.yml',
    platform: 'Linux',
  });
});

test('by default it describes the running app', () => {
  expect(fields(feedbackUrl('problem'))).toStrictEqual({
    template: 'bug_report.yml',
    version: '1.2.3',
    platform: expect.stringMatching(/^iOS /),
  });
});
