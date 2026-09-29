import { allSlugs, pageMarkdown } from '@/lib/docs';

export const dynamic = 'force-static';

export function GET() {
  return new Response(allSlugs().map(pageMarkdown).join('\n\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
