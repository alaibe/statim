/**
 * @jest-environment jsdom
 */
import { htmlWithBreaks } from './composer-html';

const field = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('htmlWithBreaks', () => {
  it('turns typed newlines into line breaks, outside code blocks', () => {
    expect(htmlWithBreaks(field('hi\nyo<b>a\n\nb</b>'))).toBe('hi<br>yo<b>a<br><br>b</b>');
    expect(htmlWithBreaks(field('<pre>a\nb</pre>'))).toBe('<pre>a\nb</pre>');
  });

  it('drops the caret markers', () => {
    expect(htmlWithBreaks(field('<code>c</code>​ x'))).toBe('<code>c</code> x');
  });
});
