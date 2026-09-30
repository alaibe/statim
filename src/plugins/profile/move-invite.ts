import { SITE } from '@/lib/guide';

const OPENING = "I'd like to continue this chat on XMTP, where it is end-to-end encrypted.";
const ADDRESS = /^My XMTP address: (0x[0-9a-fA-F]{40})$/m;

export const MOVE_ACK = 'Continuing our chat here, end-to-end encrypted.';

export function moveInviteText(address: string): string {
  return (
    `${OPENING}\nMy XMTP address: ${address}\n\n` +
    `On Statim, tap Continue on XMTP under this message. Any other XMTP app works too: ${SITE}`
  );
}

export function parseMoveInvite(text: string): string | null {
  return text.startsWith(OPENING) ? (ADDRESS.exec(text)?.[1] ?? null) : null;
}
