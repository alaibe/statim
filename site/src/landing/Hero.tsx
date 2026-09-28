import { Button } from '@/landing/Button';
import { Container } from '@/landing/Container';
import { DownloadButton } from '@/landing/DownloadButton';
import { Film } from '@/landing/Film';
import type { Release } from '@/lib/release';

function BookIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 5.5C8.5 4.3 6.5 4 3.5 4v11c3 0 5 .3 6.5 1.5m0-11c1.5-1.2 3.5-1.5 6.5-1.5v11c-3 0-5 .3-6.5 1.5m0-11v11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TerminalIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3.5 4h13v12h-13V4Zm3 4 2 2-2 2m4 0h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const protocols = ['XMTP', 'Nostr', 'Waku', 'Telegram', 'Matrix'];

export function Hero({ release }: { release: Release }) {
  return (
    <div className="relative isolate overflow-hidden pt-6 pb-20 sm:pt-10 sm:pb-32">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[52rem] bg-[radial-gradient(55%_45%_at_50%_32%,var(--color-brand-100),transparent)]"
      />
      <Container>
        <Film />
        <div className="mx-auto mt-14 max-w-3xl text-center sm:mt-20">
          {release.version && (
            <a
              href={release.url}
              className="mb-8 inline-flex items-center gap-x-2 rounded-full bg-brand-50 px-3 py-1 text-sm/6 font-medium text-brand-700 ring-1 ring-brand-600/15 ring-inset hover:bg-brand-100">
              Version {release.version} is out
              <span aria-hidden="true">→</span>
            </a>
          )}
          <h1 className="text-4xl font-medium tracking-tight text-balance text-gray-900 sm:text-5xl">
            A messenger with no company in the middle, ready for your AI.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-gray-600">
            Your account is twelve words on your device. No sign-up, no phone number, no email, and
            no account on a server that could be seized, sold or breached. On a computer, Claude
            Code or Codex can read and answer your chats through the command line, and you still
            approve anything that signs.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-4">
            <DownloadButton release={release} />
            <Button href="/guide" variant="outline" className="items-center">
              <BookIcon className="h-5 w-5 flex-none text-gray-500" />
              <span className="ml-2.5">Read the guide</span>
            </Button>
            <Button href="/guide/command-line" variant="outline" className="items-center">
              <TerminalIcon className="h-5 w-5 flex-none text-gray-500" />
              <span className="ml-2.5">Use it with AI</span>
            </Button>
          </div>
        </div>
        <div className="mx-auto mt-16 max-w-3xl">
          <p className="text-center text-sm font-semibold text-gray-900">Talks over</p>
          <ul role="list" className="mt-6 flex flex-wrap justify-center gap-x-3 gap-y-3">
            {protocols.map((name) => (
              <li
                key={name}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold tracking-tight text-gray-500 shadow-sm ring-1 shadow-gray-900/5 ring-gray-900/10">
                {name}
              </li>
            ))}
            <li className="w-full text-center text-sm text-gray-500 sm:w-auto sm:px-2 sm:py-1.5">
              and WhatsApp or Signal through a Matrix bridge
            </li>
          </ul>
        </div>
      </Container>
    </div>
  );
}
