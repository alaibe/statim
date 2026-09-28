import { AiReady } from '@/landing/AiReady';
import { Download } from '@/landing/Download';
import { Faqs } from '@/landing/Faqs';
import { Film } from '@/landing/Film';
import { Hero } from '@/landing/Hero';
import { PrimaryFeatures } from '@/landing/PrimaryFeatures';
import { Screens } from '@/landing/Screens';
import { SecondaryFeatures } from '@/landing/SecondaryFeatures';
import { getRelease } from '@/lib/release';

export default async function Home() {
  let release = await getRelease();

  return (
    <>
      <Hero release={release} />
      <Film />
      <PrimaryFeatures />
      <SecondaryFeatures />
      <AiReady />
      <Screens />
      <Download release={release} />
      <Faqs />
    </>
  );
}
