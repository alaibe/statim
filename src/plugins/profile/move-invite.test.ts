import { moveInviteText, parseMoveInvite } from './move-invite';

const ADDRESS = '0x1234567890abcdef1234567890ABCDEF12345678';

describe('move invites', () => {
  it('reads back the address an invite carries', () => {
    expect(parseMoveInvite(moveInviteText(ADDRESS))).toBe(ADDRESS);
  });

  it('ignores ordinary messages that mention an address', () => {
    expect(parseMoveInvite(`My XMTP address: ${ADDRESS}`)).toBeNull();
    expect(parseMoveInvite('Let us move to XMTP')).toBeNull();
  });

  it('ignores an invite whose address was cut short', () => {
    expect(parseMoveInvite(moveInviteText(ADDRESS.slice(0, -1)))).toBeNull();
  });
});
