import { phoneLinkCode, readPhoneLink } from './phone-link';

const link = { homeserver: 'https://mini.tail1234.ts.net:8448', loginToken: 'one-time' };

describe('the code a computer shows a phone', () => {
  it('reads back what the computer wrote', () => {
    expect(readPhoneLink(phoneLinkCode(link))).toEqual(link);
  });

  it('ignores codes that are not from Statim or point anywhere but an HTTPS server', () => {
    const code = (fields: Record<string, unknown>) =>
      JSON.stringify({ ...JSON.parse(phoneLinkCode(link)), ...fields });
    for (const scanned of [
      'wc:abc@2',
      'null',
      code({ kind: 'other' }),
      code({ homeserver: 'http://mini.tail1234.ts.net:8448' }),
      code({ homeserver: 'https://mini.tail1234.ts.net:8448/path' }),
      code({ loginToken: 7 }),
    ]) {
      expect(readPhoneLink(scanned)).toBeNull();
    }
  });
});
