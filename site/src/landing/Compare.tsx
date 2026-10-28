import Link from 'next/link';

import { type Comparison, comparisonPath, comparisons } from '@/lib/compare';

const token = /(\[[^\]]+\]\([^)]+\)|`[^`]+`)/;

function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  let className = 'font-medium text-brand-600 hover:text-brand-500';
  return href.startsWith('/') ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function Inline({ text }: { text: string }) {
  return text.split(token).map((part, index) => {
    let link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <TextLink key={index} href={link[2]}>
          {link[1]}
        </TextLink>
      );
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={index} className="rounded bg-gray-100 px-1 py-0.5 text-[0.875em] text-gray-900">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function OtherComparisons({ current }: { current?: Comparison }) {
  return (
    <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {comparisons
        .filter((comparison) => comparison !== current)
        .map((comparison) => (
          <li key={comparison.id}>
            <Link
              href={comparisonPath(comparison)}
              className="block h-full rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg hover:shadow-gray-900/5">
              <p className="font-semibold text-gray-900">Statim vs {comparison.name}</p>
              <p className="mt-2 text-sm text-gray-600">{comparison.summary}</p>
            </Link>
          </li>
        ))}
    </ul>
  );
}
