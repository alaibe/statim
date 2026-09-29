import type { BridgedNetwork } from '@/core/messaging/networks';
import { KNOWN_BRIDGES, provisioningName } from '@/protocols/matrix/bridges';
import type {
  BridgeProvisioning,
  ProvisioningCapabilities,
  RemotePerson,
} from '@/protocols/matrix/provisioning';

/** How someone new is found on a bridge; null when it only opens chats that already exist. */
export type BridgeAddBy = 'search' | 'lookup' | null;

export interface BridgeLink {
  network: BridgedNetwork;
  provisioning: BridgeProvisioning;
  addBy: BridgeAddBy;
  /** Your own names there, lowercased. */
  selves: ReadonlySet<string>;
}

export async function bridgeLinks(
  provisioningFor: (bridge: string) => BridgeProvisioning | null
): Promise<BridgeLink[]> {
  const links = await Promise.all(
    KNOWN_BRIDGES.map(async (bridge): Promise<BridgeLink[]> => {
      const provisioning = provisioningFor(provisioningName(bridge));
      if (!provisioning) return [];
      const [whoami, capabilities] = await Promise.all([
        provisioning.whoami().catch(() => null),
        provisioning.capabilities().catch(() => null),
      ]);
      if (!whoami || whoami.logins.length === 0) return [];
      const selves = whoami.logins.flatMap((login) =>
        [login.name, login.profile?.name, login.profile?.username].filter(
          (name): name is string => !!name
        )
      );
      return [
        {
          network: bridge.network,
          provisioning,
          addBy: addByOf(capabilities),
          selves: new Set(selves.map((name) => name.toLowerCase())),
        },
      ];
    })
  );
  return links.flat();
}

function addByOf(capabilities: ProvisioningCapabilities | null): BridgeAddBy {
  const can = capabilities?.resolve_identifier;
  if (!can?.create_dm) return null;
  if (can.search) return 'search';
  return can.lookup_username || can.lookup_phone || can.lookup_email ? 'lookup' : null;
}

export interface Candidate {
  participantId: string;
  name: string;
  detail?: string;
  /** Their id on the far network, which the bridge opens the DM with. */
  remoteId?: string;
}

export function candidateOf(person: RemotePerson): Candidate {
  return {
    participantId: person.mxid ?? person.id,
    name: person.name ?? person.id,
    detail: person.identifiers?.[0],
    remoteId: person.id,
  };
}
