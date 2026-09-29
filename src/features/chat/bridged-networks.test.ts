import type { ChatSession } from '@/core/messaging/protocol';
import { BridgeProvisioning, type ProvisioningCapabilities } from '@/protocols/matrix/provisioning';

import { addBy, bridgeLinks } from './bridged-networks';

const CAN: ProvisioningCapabilities['resolve_identifier'] = {
  create_dm: true,
  lookup_phone: false,
  lookup_email: false,
  lookup_username: false,
  any_phone: false,
  contact_list: false,
  search: true,
};

function session(bridges: Record<string, Record<string, unknown>>) {
  return {
    bridgeProvisioning: (name: string) => {
      const answers = bridges[name];
      return new BridgeProvisioning(async (path) => {
        const answer = answers?.[path];
        if (answer === undefined) throw new Error('404');
        return answer;
      });
    },
  } as unknown as ChatSession;
}

it('lists only the bridges you are signed in to, with your own names set aside', async () => {
  const links = await bridgeLinks(
    session({
      slack: {
        '/v3/whoami': {
          login_flows: [],
          logins: [{ id: 'T1-U1', name: 'Anthony Laibe', profile: { username: 'anthony' } }],
        },
        '/v3/capabilities': { provisioning: { resolve_identifier: CAN } },
      },
      meta: { '/v3/whoami': { login_flows: [], logins: [] } },
    })
  );

  expect(links.map((link) => link.network)).toEqual(['slack']);
  expect([...links[0].selves]).toEqual(['anthony laibe', 'anthony']);
  expect(addBy(links[0])).toBe('search');
});

it('offers only existing chats when the bridge cannot start one', () => {
  const link = { can: { ...CAN, create_dm: false } } as Parameters<typeof addBy>[0];
  expect(addBy(link)).toBeNull();
  expect(addBy(undefined)).toBeNull();
  expect(
    addBy({ can: { ...CAN, search: false, lookup_username: true } } as Parameters<typeof addBy>[0])
  ).toBe('lookup');
});
