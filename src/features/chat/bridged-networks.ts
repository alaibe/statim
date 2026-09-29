import type { BridgedNetwork } from '@/core/messaging/networks';
import type { ChatSession } from '@/core/messaging/protocol';
import { KNOWN_BRIDGES, provisioningName } from '@/protocols/matrix/bridges';
import type {
  BridgeProvisioning,
  MatrixCapabilities,
  ProvisioningCapabilities,
} from '@/protocols/matrix/provisioning';

export interface BridgeLink {
  network: BridgedNetwork;
  provisioning: BridgeProvisioning;
  /** What the bridge lets you do to reach someone new; null when it does not say. */
  can: ProvisioningCapabilities['resolve_identifier'] | null;
  /** Your own names there, lowercased, so your own accounts are not offered as people. */
  selves: ReadonlySet<string>;
}

/** The bridges on your homeserver that you are signed in to. */
export async function bridgeLinks(
  session: ChatSession & Partial<MatrixCapabilities>
): Promise<BridgeLink[]> {
  const links = await Promise.all(
    KNOWN_BRIDGES.map(async (bridge): Promise<BridgeLink | null> => {
      const provisioning = session.bridgeProvisioning?.(provisioningName(bridge));
      if (!provisioning) return null;
      const whoami = await provisioning.whoami().catch(() => null);
      if (!whoami || whoami.logins.length === 0) return null;
      const capabilities = await provisioning.capabilities().catch(() => null);
      const selves = whoami.logins.flatMap((login) =>
        [login.name, login.profile?.name, login.profile?.username].filter(
          (name): name is string => !!name
        )
      );
      return {
        network: bridge.network,
        provisioning,
        can: capabilities?.resolve_identifier ?? null,
        selves: new Set(selves.map((name) => name.toLowerCase())),
      };
    })
  );
  return links.filter((link) => link !== null);
}

/** How someone new is added on this bridge, or null when only existing chats can be opened. */
export function addBy(link: BridgeLink | undefined): 'search' | 'lookup' | null {
  const can = link?.can;
  if (!can?.create_dm) return null;
  if (can.search) return 'search';
  return can.lookup_username || can.lookup_phone || can.lookup_email ? 'lookup' : null;
}
