import { allSlugs, pageMarkdown } from '@/lib/docs';

type Params = { params: Promise<{ file: string }> };

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return allSlugs()
    .filter((slug) => !slug.includes('/'))
    .map((slug) => ({ file: `${slug}.md` }));
}

export async function GET(_: Request, { params }: Params) {
  let slug = (await params).file.replace(/\.md$/, '');
  return new Response(pageMarkdown(slug), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
