import type { Metadata } from 'next';

import { basePath, origin, siteUrl } from '@/lib/site';

export const siteMetadata: Metadata = {
  metadataBase: new URL(origin),
  icons: { icon: `${basePath}/logomark.svg` },
  openGraph: {
    siteName: 'Statim',
    images: [{ url: `${basePath}/promo/og.jpg`, width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image' },
};

export function pageUrl(path: string) {
  return `${siteUrl}${path.replace(/\/?$/, '/')}`;
}

export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  let url = pageUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { ...siteMetadata.openGraph, title, description, url },
    twitter: { ...siteMetadata.twitter, title, description },
  };
}
