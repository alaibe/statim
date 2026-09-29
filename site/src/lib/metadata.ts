import type { Metadata } from 'next';

import { basePath, origin } from '@/lib/site';

export const siteMetadata: Metadata = {
  metadataBase: new URL(origin),
  icons: { icon: `${basePath}/logomark.svg` },
  openGraph: {
    siteName: 'Statim',
    images: [`${basePath}/screenshots/chats.png`],
  },
};
