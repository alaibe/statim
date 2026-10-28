import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/landing/Button';
import { Inline, OtherComparisons } from '@/landing/Compare';
import { Container } from '@/landing/Container';
import { JsonLd } from '@/landing/JsonLd';
import {
  type Fact,
  checked,
  comparisonPath,
  comparisons,
  factLabels,
  getComparison,
  statim,
} from '@/lib/compare';
import { pageMetadata, pageUrl } from '@/lib/metadata';
import { repoUrl } from '@/lib/site';

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return comparisons.map((comparison) => ({ slug: `statim-vs-${comparison.id}` }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  let comparison = getComparison((await params).slug);
  return pageMetadata({
    title: comparison.title,
    description: comparison.description,
    path: comparisonPath(comparison),
  });
}

const checkedLabel = new Date(checked).toLocaleDateString('en-GB', {
  month: 'long',
  year: 'numeric',
});

function PickList({ title, items }: { title: string; items: Array<string> }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <ul role="list" className="mt-4 space-y-3 text-gray-700">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-2.5 h-1.5 w-1.5 flex-none rounded-full bg-brand-600"
            />
            <span>
              <Inline text={item} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ComparisonPage({ params }: Params) {
  let comparison = getComparison((await params).slug);
  let path = comparisonPath(comparison);
  let facts = Object.keys(factLabels) as Array<Fact>;

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Statim', item: pageUrl('/') },
            { '@type': 'ListItem', position: 2, name: 'Compare', item: pageUrl('/compare') },
            {
              '@type': 'ListItem',
              position: 3,
              name: `Statim vs ${comparison.name}`,
              item: pageUrl(path),
            },
          ],
        }}
      />
      <Container className="pt-6 pb-20 sm:pt-10 sm:pb-28">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
          <ol className="flex gap-2">
            <li>
              <Link href="/compare" className="hover:text-gray-900">
                Compare
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-gray-900">
              Statim vs {comparison.name}
            </li>
          </ol>
        </nav>
        <div className="mt-8 max-w-3xl">
          <h1 className="text-4xl font-medium tracking-tight text-balance text-gray-900 sm:text-5xl">
            Statim vs {comparison.name}
          </h1>
          <p className="mt-6 text-lg text-pretty text-gray-600">
            <Inline text={comparison.lead} />
          </p>
        </div>

        <section aria-labelledby="facts-title" className="mt-14">
          <h2 id="facts-title" className="text-2xl font-medium tracking-tight text-gray-900">
            Side by side
          </h2>
          <table className="mt-6 w-full text-left text-sm max-sm:block">
            <thead className="max-sm:sr-only">
              <tr className="border-b border-gray-300">
                <th scope="col" className="w-1/5 py-3 pr-6 font-semibold text-gray-900">
                  <span className="sr-only">Topic</span>
                </th>
                <th scope="col" className="w-2/5 py-3 pr-6 font-semibold text-gray-900">
                  Statim
                </th>
                <th scope="col" className="w-2/5 py-3 font-semibold text-gray-900">
                  {comparison.name}
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {facts.map((fact) => (
                <tr
                  key={fact}
                  className="border-b border-gray-200 align-top max-sm:block max-sm:py-4">
                  <th
                    scope="row"
                    className="py-4 pr-6 font-semibold text-gray-900 max-sm:block max-sm:py-0">
                    {factLabels[fact]}
                  </th>
                  <td className="py-4 pr-6 text-gray-700 max-sm:mt-2 max-sm:block max-sm:py-0 max-sm:pr-0">
                    <span className="font-medium text-gray-900 sm:hidden">Statim: </span>
                    {statim.facts[fact]}
                  </td>
                  <td className="py-4 text-gray-700 max-sm:mt-2 max-sm:block max-sm:py-0">
                    <span className="font-medium text-gray-900 sm:hidden">{comparison.name}: </span>
                    {comparison.facts[fact]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="mt-16 max-w-3xl space-y-12">
          {comparison.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl font-medium tracking-tight text-gray-900">
                {section.heading}
              </h2>
              <div className="mt-4 space-y-4 text-base/7 text-gray-700">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>
                    <Inline text={paragraph} />
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section aria-labelledby="pick-title" className="mt-16">
          <h2 id="pick-title" className="text-2xl font-medium tracking-tight text-gray-900">
            Which one to use
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PickList title="Statim, if" items={comparison.pickStatim} />
            <PickList title={`${comparison.name}, if`} items={comparison.pickOther} />
          </div>
        </section>

        <div className="mt-16 grid max-w-5xl grid-cols-1 gap-10 text-sm sm:grid-cols-2">
          <div>
            <h2 className="font-semibold text-gray-900">In the guide</h2>
            <ul role="list" className="mt-3 space-y-2">
              {comparison.guide.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-brand-600 hover:text-brand-500">
                    {link.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Sources</h2>
            <ul role="list" className="mt-3 space-y-2">
              {comparison.sources.map((source) => (
                <li key={source.href}>
                  <a href={source.href} className="text-brand-600 hover:text-brand-500">
                    {source.title}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-gray-500">
              Checked against {comparison.name}&apos;s own pages in {checkedLabel}. If something
              here is out of date,{' '}
              <a href={`${repoUrl}/issues`} className="text-gray-900 underline">
                open an issue
              </a>
              .
            </p>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap gap-4">
          <Button href="/#download" color="brand">
            Download Statim
          </Button>
          <Button href="/compare" variant="outline">
            All comparisons
          </Button>
        </div>

        <section aria-labelledby="others-title" className="mt-20 border-t border-gray-200 pt-16">
          <h2 id="others-title" className="text-2xl font-medium tracking-tight text-gray-900">
            Other comparisons
          </h2>
          <div className="mt-6">
            <OtherComparisons current={comparison} />
          </div>
        </section>
      </Container>
    </>
  );
}
