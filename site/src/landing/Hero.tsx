import Link from 'next/link';

import { Container } from '@/landing/Container';
import { DownloadButton } from '@/landing/DownloadButton';
import { Film } from '@/landing/Film';
import type { Release } from '@/lib/release';

const protocols = [
  ['XMTP', 'bg-[#f0533a]'],
  ['Nostr', 'bg-[#9b5de5]'],
  ['Waku', 'bg-[#11b5a4]'],
  ['Telegram', 'bg-[#2aabee]'],
  ['Matrix', 'bg-gray-900'],
];

export function Hero({ release }: { release: Release }) {
  return (
    <div className="relative isolate overflow-hidden pt-6 sm:pt-10">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gray-900 sm:h-64"
      />
      <Container>
        <div className="grid gap-x-12 gap-y-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            {release.version && (
              <a
                href={release.url}
                className="mb-5 inline-flex items-center gap-x-2 rounded-full bg-brand-50 px-3 py-1 text-sm/6 font-medium text-brand-700 ring-1 ring-brand-600/15 ring-inset hover:bg-brand-100">
                Version {release.version} is out
                <span aria-hidden="true">→</span>
              </a>
            )}
            <h1 className="text-4xl font-medium tracking-tight text-balance text-gray-900 sm:text-6xl/[1.04]">
              A messenger with no company in the middle, ready for your AI.
            </h1>
          </div>
          <div className="lg:col-span-5 lg:pb-1.5">
            <p className="text-base text-pretty text-gray-600 sm:text-lg">
              Your account is twelve words on your device. No sign-up, no phone number, no email,
              and no server of ours to seize, sell or breach.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
              <DownloadButton release={release} />
              <Link href="/guide/command-line" className="text-sm font-semibold text-gray-900">
                Use it with AI <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 sm:mt-10 sm:gap-x-5 sm:text-sm">
          <span className="font-medium text-gray-900">Talks over</span>
          {protocols.map(([name, dot]) => (
            <span key={name} className="inline-flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              {name}
            </span>
          ))}
          <span className="hidden sm:inline">and WhatsApp or Signal through a Matrix bridge</span>
        </div>
        <div className="relative isolate mt-6 overflow-hidden rounded-[2rem] bg-brand-700 px-4 py-8 shadow-2xl ring-1 shadow-gray-900/30 ring-white/10 sm:p-10 lg:p-12">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(80%_70%_at_15%_0%,var(--color-brand-500),transparent),radial-gradient(70%_70%_at_100%_100%,var(--color-brand-950),transparent)]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.16)_1px,transparent_1px)] mask-[radial-gradient(70%_80%_at_50%_40%,black,transparent)] bg-size-[22px_22px]"
          />
          <Film />
        </div>
      </Container>
    </div>
  );
}
