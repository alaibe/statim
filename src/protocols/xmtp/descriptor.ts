import type { ProtocolDescriptor } from '@/core/messaging/registry';
import { guideUrl } from '@/lib/guide';
import { loadDbEncryptionKey } from '@/core/account/keyring';

export const XMTP_PROTOCOL = {
  id: 'xmtp',
  label: 'XMTP',
  folded: false,
  description: 'Messages addressed to Ethereum accounts, encrypted with MLS.',
  docsUrl: guideUrl('networks', 'xmtp'),
  address: {
    label: 'Address or ENS name',
    placeholder: 'vitalik.eth or 0x…',
    noun: 'an address',
    hint: 'Add an Ethereum address or ENS name.',
    unreachable: (input) =>
      `${input} has no XMTP inbox yet, so they cannot receive messages. ` +
      'Ask them to open an XMTP app once.',
  },
  meta: {
    trustModel:
      'Nobody, including the nodes that relay them, can read your messages or reconstruct a group roster. ' +
      'Relays do see that two inboxes are talking.',
    properties: {
      endToEndEncrypted: true,
      forwardSecrecy: true,
      metadataPrivacy: 'medium',
      maxGroupSize: 'unbounded',
      groupModel: 'enforced',
      durableHistory: true,
    },
  },
  configSchema: {
    fields: [
      {
        key: 'env',
        label: 'Environment',
        kind: 'text',
        placeholder: 'production',
        help: 'production or dev. Two clients only see each other on the same one.',
      },
    ],
  },
  usesPluginContentTypes: true,
  async connect({ accountId, account, contentTypes, config, storage }) {
    const [{ XmtpSession }, { createPluginCodec }, { loadOrCreateDbEncryptionKey }] =
      await Promise.all([import('./adapter'), import('./codec'), import('@/core/account/keyring')]);
    const env = xmtpEnvironment(config.env);
    return XmtpSession.connect({
      accountId,
      account,
      dbEncryptionKey: await loadOrCreateDbEncryptionKey(accountId),
      codecs: contentTypes.map(createPluginCodec),
      env,
      storage,
    });
  },
  installations: {
    async list({ account, config }) {
      const { inboxInstallations } = await import('./adapter');
      return inboxInstallations(account, xmtpEnvironment(config.env));
    },
    async revoke({ account, config }, ids) {
      const { revokeInboxInstallations } = await import('./adapter');
      await revokeInboxInstallations(account, ids, xmtpEnvironment(config.env));
    },
  },
  async eraseLocalData({ accountId, address, config }) {
    const dbEncryptionKey = await loadDbEncryptionKey(accountId);
    if (!dbEncryptionKey) return;
    const { eraseXmtpLocalDatabase } = await import('./adapter');
    await eraseXmtpLocalDatabase({
      address,
      dbEncryptionKey,
      env: xmtpEnvironment(config.env),
    });
  },
} satisfies ProtocolDescriptor;

function xmtpEnvironment(value: string | undefined): 'dev' | 'local' | 'production' | undefined {
  const env = value?.trim();
  return env === 'dev' || env === 'local' || env === 'production' ? env : undefined;
}
