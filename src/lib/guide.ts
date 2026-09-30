export const SITE = 'https://alaibe.github.io/statim/';
const GUIDE = `${SITE}guide`;

/** A page of the user guide, for the "How to set this up" links. */
export function guideUrl(page: string, anchor?: string): string {
  return anchor ? `${GUIDE}/${page}#${anchor}` : `${GUIDE}/${page}`;
}
