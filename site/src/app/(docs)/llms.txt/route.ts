import { getPage, markdownUrl } from '@/lib/docs';
import { navigation, siteUrl } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  let sections = navigation.map((group) => {
    let links = group.links
      .filter((link) => link.href !== '/guide')
      .map(
        (link) =>
          `- [${link.title}](${markdownUrl(link.href)}): ${getPage(link.href.slice(1)).description}`
      );
    return `## ${group.title}\n\n${links.join('\n')}`;
  });

  return new Response(
    `${[
      '# Statim',
      '> Statim is a messenger with no company in the middle. Your account is twelve words on your device, and one chat list holds your XMTP, Matrix, Telegram, Nostr and Status chats, with a wallet in the chat and a command line an AI assistant can use.',
      `This is the user guide. Every page is Markdown; [llms-full.txt](${siteUrl}/llms-full.txt) has all of them in one file.`,
      `## For AI assistants\n\nOn a computer, the \`statim\` command reads and sends the user's messages through the running app. It is off until the user turns it on in Settings › Command line. \`statim skills install\` gives Claude Code the instructions (\`--codex\` for Codex, \`--dir <folder>\` for another assistant), and \`statim --skills\` prints them. \`statim mcp\` offers the same commands as tools to any app that takes a local MCP server, such as Claude Desktop or Cursor.\n\n- [Command line](${markdownUrl('/guide/command-line')}): turning it on, installing it, connecting an AI app over MCP, and what the assistant may do.\n- [Statim skill](${siteUrl}/skills/statim/SKILL.md): the file \`statim skills install\` writes.`,
      ...sections,
    ].join('\n\n')}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}
