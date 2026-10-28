import type { Metadata } from 'next';

import { Markdown } from '@/docs/Markdown';
import { Prose } from '@/docs/Prose';
import { allSlugs, getPage, markdownUrl } from '@/lib/docs';
import { pageMetadata } from '@/lib/metadata';
import { repoUrl } from '@/lib/site';

type Params = { params: Promise<{ slug: Array<string> }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug: slug.split('/') }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  let page = getPage((await params).slug.join('/'));
  let metadata = pageMetadata({
    title: page.title,
    description: page.description,
    path: page.href,
  });
  return {
    ...metadata,
    alternates: { ...metadata.alternates, types: { 'text/markdown': markdownUrl(page.href) } },
  };
}

export default async function DocPage({ params }: Params) {
  let slug = (await params).slug.join('/');
  let page = getPage(slug);
  let source = ['privacy', 'disclaimer'].includes(slug)
    ? `${repoUrl}/blob/main/${slug.toUpperCase()}.md`
    : `${repoUrl}/blob/main/docs/${slug}.md`;

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <Prose className="flex-auto">
        <Markdown tree={page.tree} />
      </Prose>
      <p className="mx-auto mt-16 w-full max-w-2xl text-sm text-zinc-500 lg:max-w-5xl dark:text-zinc-400">
        <a href={source} className="hover:text-zinc-900 dark:hover:text-white">
          Edit this page on GitHub
        </a>
      </p>
    </article>
  );
}
