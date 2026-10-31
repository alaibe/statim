import Constants from 'expo-constants';

import { PLATFORM_NAME } from './platform-name';

const NEW_ISSUE = 'https://github.com/alaibe/statim/issues/new';

const TEMPLATES = { problem: 'bug_report.yml', feature: 'feature_request.yml' } as const;

/** GitHub's issue form, with this app's version and platform filled in. */
export function feedbackUrl(
  kind: keyof typeof TEMPLATES,
  about: { version?: string; platform: string } = {
    version: Constants.expoConfig?.version,
    platform: PLATFORM_NAME,
  }
): string {
  const query = new URLSearchParams({
    template: TEMPLATES[kind],
    ...(about.version ? { version: about.version } : {}),
    platform: about.platform,
  });
  return `${NEW_ISSUE}?${query}`;
}
