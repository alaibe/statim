import Link from 'next/link';

import { OtherComparisons } from '@/landing/Compare';
import { Container } from '@/landing/Container';
import { JsonLd } from '@/landing/JsonLd';
import { type Glance, comparisonPath, comparisons, glanceLabels, statim } from '@/lib/compare';
import { pageMetadata, pageUrl } from '@/lib/metadata';

export const metadata = pageMetadata({
  title: 'Statim vs Signal, Telegram, WhatsApp, Status and more',
  description:
    'How Statim compares with Status, Signal, Telegram, WhatsApp, Session, SimpleX, Beeper and Element on sign-up, encryption, servers, wallets and calls.',
  path: '/compare',
});

export default function Compare() {
  let columns = Object.keys(glanceLabels) as Array<Glance>;
  let rows = [
    { name: 'Statim', href: null, glance: statim.glance },
    ...comparisons.map((comparison) => ({
      name: comparison.name,
      href: comparisonPath(comparison),
      glance: comparison.glance,
    })),
  ];

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Statim', item: pageUrl('/') },
                { '@type': 'ListItem', position: 2, name: 'Compare', item: pageUrl('/compare') },
              ],
            },
            {
              '@type': 'ItemList',
              itemListElement: comparisons.map((comparison, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: `Statim vs ${comparison.name}`,
                url: pageUrl(comparisonPath(comparison)),
              })),
            },
          ],
        }}
      />
      <Container className="pt-6 pb-20 sm:pt-10 sm:pb-28">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-medium tracking-tight text-balance text-gray-900 sm:text-5xl">
            How Statim compares
          </h1>
          <p className="mt-6 text-lg text-pretty text-gray-600">
            Statim is a messenger whose account is twelve words on your device, with XMTP, Nostr,
            Status, Telegram and Matrix in one chat list. Here is how that compares with the apps
            people ask about, including where they do better.
          </p>
        </div>

        <section aria-labelledby="glance-title" className="mt-14">
          <h2 id="glance-title" className="text-2xl font-medium tracking-tight text-gray-900">
            At a glance
          </h2>
          <div className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th scope="col" className="py-3 pr-6 font-semibold text-gray-900">
                    App
                  </th>
                  {columns.map((column) => (
                    <th key={column} scope="col" className="py-3 pr-6 font-semibold text-gray-900">
                      {glanceLabels[column]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-b border-gray-200 align-top">
                    <th scope="row" className="py-4 pr-6 font-semibold whitespace-nowrap">
                      {row.href ? (
                        <Link href={row.href} className="text-brand-600 hover:text-brand-500">
                          {row.name}
                        </Link>
                      ) : (
                        <span className="text-gray-900">{row.name}</span>
                      )}
                    </th>
                    {columns.map((column) => (
                      <td key={column} className="py-4 pr-6 text-gray-700">
                        {row.glance[column]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="pages-title" className="mt-20">
          <h2 id="pages-title" className="text-2xl font-medium tracking-tight text-gray-900">
            One app at a time
          </h2>
          <div className="mt-6">
            <OtherComparisons />
          </div>
        </section>
      </Container>
    </>
  );
}
