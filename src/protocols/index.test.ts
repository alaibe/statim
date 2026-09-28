import { LOCAL_PROTOCOL, PROTOCOL_IDS } from '@/core/messaging/namespace';

import { PROTOCOLS } from '.';

it('has one descriptor for each protocol the app speaks', () => {
  expect(PROTOCOLS.map((protocol) => protocol.id).sort()).toEqual(
    PROTOCOL_IDS.filter((id) => id !== LOCAL_PROTOCOL).sort()
  );
});
