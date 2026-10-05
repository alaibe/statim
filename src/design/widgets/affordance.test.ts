import { affordanceFor } from './affordance';

const action = (label: string) => ({ label, command: '/x' });

describe('what a row says a tap will do', () => {
  it('says nothing when nothing happens', () => {
    expect(affordanceFor(undefined)).toBeNull();
    expect(affordanceFor([])).toBeNull();
  });

  it('names the single action, so the row reads as a sentence', () => {
    expect(affordanceFor([action('Send ETH')])).toBe('Send ETH');
  });

  it('promises only options when there are several', () => {
    expect(affordanceFor([action('Open'), action('Switch off')])).toBe('Options');
  });
});
