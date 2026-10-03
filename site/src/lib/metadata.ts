import type { Metadata } from 'next';

import { basePath, origin } from '@/lib/site';

export const siteMetadata: Metadata = {
  metadataBase: new URL(origin),
  icons: { icon: `${basePath}/logomark.svg` },
  openGraph: {
    siteName: 'Statim',
    images: [{ url: `${basePath}/promo/og.jpg`, width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image' },
};
