import clsx from 'clsx';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { Footer } from '@/landing/Footer';
import { Header } from '@/landing/Header';
import { Analytics } from '@/lib/analytics';
import { siteMetadata } from '@/lib/metadata';

import '@/styles/landing.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  ...siteMetadata,
  title: 'Statim: a messenger with no company in the middle',
  description:
    'Your account is twelve words on your device. Encrypted chats over XMTP, Nostr and Status, your Telegram and Matrix in the same chat list, a wallet in the chat, and a command line your AI assistant can use.',
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={clsx('bg-gray-50 antialiased', inter.variable)}>
      <body>
        <Header />
        <main className="flex-auto">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
