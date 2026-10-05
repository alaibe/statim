import { handleTrezorCallback } from './trezor-deeplink';

/**
 * Only the callback routing is testable here. Everything else opens Trezor
 * Suite, which needs the app installed and a device plugged into it.
 */
describe('handleTrezorCallback', () => {
  it('ignores a link nothing is waiting for', () => {
    // Unmatched ids must be passed on: other features use deep links too, and
    // eating theirs would break them silently.
    expect(handleTrezorCallback('myapp://trezor?id=nobody&payload=0xabc')).toBe(false);
  });

  it('ignores a link with no request id at all', () => {
    expect(handleTrezorCallback('myapp://something-else')).toBe(false);
  });
});

describe('parsing the callback', () => {
  it('reads a payload out of a custom-scheme URL', () => {
    expect(handleTrezorCallback('statim://trezor?id=x&payload=0xabc')).toBe(false);
  });

  it('does not mistake an encoded value for a missing one', () => {
    expect(handleTrezorCallback('statim://trezor?id=a%2Fb&payload=0x1')).toBe(false);
  });
});
