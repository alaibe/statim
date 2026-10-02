/** Text the model must treat as data, never as an instruction to follow. */
export function tagged(tag: string, text: string): string {
  return `<${tag}>\n${text.replaceAll(`</${tag}>`, `< /${tag}>`)}\n</${tag}>`;
}
