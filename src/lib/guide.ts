export const SITE = "https://statim.laibe.cc/";
const GUIDE = `${SITE}guide`;

export function guideUrl(page: string, anchor?: string): string {
  return anchor ? `${GUIDE}/${page}#${anchor}` : `${GUIDE}/${page}`;
}
