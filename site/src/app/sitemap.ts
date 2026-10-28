import type { MetadataRoute } from 'next';

import { checked, comparisonPath, comparisons } from '@/lib/compare';
import { allSlugs } from '@/lib/docs';
import { pageUrl } from '@/lib/metadata';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: pageUrl('/') },
    { url: pageUrl('/compare'), lastModified: checked },
    ...comparisons.map((comparison) => ({
      url: pageUrl(comparisonPath(comparison)),
      lastModified: checked,
    })),
    { url: pageUrl('/guide') },
    ...allSlugs().map((slug) => ({ url: pageUrl(`/${slug}`) })),
  ];
}
