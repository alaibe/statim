/**
 * The composer field's HTML with each newline character as a line break: WebKit
 * types a line break into the pre-wrap field as one, and HTML reads it as a space.
 */
export function htmlWithBreaks(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    if (!text.data.includes('\n') || text.parentElement?.closest('pre')) continue;
    const [first, ...rest] = text.data.split('\n');
    text.replaceWith(first, ...rest.flatMap((part) => [document.createElement('br'), part]));
  }
  return copy.innerHTML.replace(/​/g, '');
}
