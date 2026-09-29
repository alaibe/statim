import { BridgeProvisioning } from '@/protocols/matrix/provisioning';

import { bridgeLinks } from './bridged-networks';

const CAN = {
  create_dm: true,
  lookup_phone: false,
  lookup_email: false,
  lookup_username: false,
  search: true,
};

function bridges(answers: Record<string, Record<string, unknown>>) {
  return (name: string) =>
    new BridgeProvisioning(async (path) => {
      const answer = answers[name]?.[path];
      if (answer === undefined) throw new Error('404');
      return answer;
    });
}

const whoami = (logins: unknown[]) => ({ login_flows: [], logins });

it('lists only the bridges you are signed in to, with your own names set aside', async () => {
  const links = await bridgeLinks(
    bridges({
      slack: {
        '/v3/whoami': whoami([
          { id: 'T1-U1', name: 'Anthony Laibe', profile: { username: 'anthony' } },
        ]),
        '/v3/capabilities': { provisioning: { resolve_identifier: CAN } },
      },
      meta: { '/v3/whoami': whoami([]) },
    })
  );

  expect(links.map((link) => [link.network, link.addBy])).toEqual([['slack', 'search']]);
  expect([...links[0].selves]).toEqual(['anthony laibe', 'anthony']);
});

it('finds people the way the bridge allows, or not at all', async () => {
  const signedIn = whoami([{ id: 'U1', name: 'Me' }]);
  const links = await bridgeLinks(
    bridges({
      slack: {
        '/v3/whoami': signedIn,
        '/v3/capabilities': {
          provisioning: { resolve_identifier: { ...CAN, search: false, lookup_username: true } },
        },
      },
      discord: { '/v3/whoami': signedIn },
      instagram: {
        '/v3/whoami': signedIn,
        '/v3/capabilities': { provisioning: { resolve_identifier: { ...CAN, create_dm: false } } },
      },
    })
  );

  expect(Object.fromEntries(links.map((link) => [link.network, link.addBy]))).toEqual({
    slack: 'lookup',
    discord: null,
    instagram: null,
  });
});
