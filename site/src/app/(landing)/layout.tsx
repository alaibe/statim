import clsx from 'clsx';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { Footer } from '@/landing/Footer';
import { Header } from '@/landing/Header';
import { Analytics } from '@/lib/analytics';
import { siteMetadata } from '@/lib/metadata';

import '@/styles/landing.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = siteMetadata;

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
