import { AiReady } from '@/landing/AiReady';
import { Download } from '@/landing/Download';
import { Faqs } from '@/landing/Faqs';
import { Hero } from '@/landing/Hero';
import { JsonLd } from '@/landing/JsonLd';
import { PrimaryFeatures } from '@/landing/PrimaryFeatures';
import { Screens } from '@/landing/Screens';
import { SecondaryFeatures } from '@/landing/SecondaryFeatures';
import { pageMetadata, pageUrl } from '@/lib/metadata';
import { getRelease } from '@/lib/release';
import { basePath, origin, repoUrl } from '@/lib/site';

const description =
  'Your account is twelve words on your device. Encrypted chats over XMTP, Nostr and Status, your Telegram and Matrix in the same chat list, a wallet in the chat, and a command line your AI assistant can use.';

export const metadata = pageMetadata({
  title: 'Statim: a messenger with no company in the middle',
  description,
  path: '/',
});

export default async function Home() {
  let release = await getRelease();

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'Statim',
          description,
          url: pageUrl('/'),
          image: `${origin}${basePath}/promo/og.jpg`,
          applicationCategory: 'CommunicationApplication',
          operatingSystem: 'macOS, Windows, Linux, iOS, Android',
          offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
          license: `${repoUrl}/blob/main/LICENSE`,
          ...(release.version && { softwareVersion: release.version }),
        }}
      />
      <Hero release={release} />
      <PrimaryFeatures />
      <SecondaryFeatures />
      <AiReady />
      <Screens />
      <Download release={release} />
      <Faqs />
    </>
  );
}
