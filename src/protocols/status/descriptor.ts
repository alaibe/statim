import { readInlineAttachment, writeInlineAttachment } from '@/core/messaging/attachments';
import type { ProtocolDescriptor } from '@/core/messaging/registry';
import { base64ToBytes, bytesToBase64 } from '@/lib/bytes';
import { guideUrl } from '@/lib/guide';

export const STATUS_PROTOCOL = {
  id: 'status',
  docsUrl: guideUrl('networks', 'status'),
  label: 'Status',
  external: false,
  description: 'DMs and groups with people on Status.',
  address: {
    label: 'Chat key',
    placeholder: 'zQ3sh… or a status.app link',
    noun: 'a chat key',
    hint: 'Add a Status chat key: zQ3sh…, its 0x04… form, or a status.app/u link.',
    unreachable: (input) =>
      `${input} is not a Status chat key. ` +
      'Paste the zQ3sh… key or the profile link Status shares; names are not looked up.',
  },
  meta: {
    trustModel:
      "Runs through Status's own nodes, or through an nwaku node you choose. Those nodes see " +
      'which topics this device reads and writes, and can withhold messages; they cannot read them.',
    properties: {
      endToEndEncrypted: true,
      forwardSecrecy: false,
      metadataPrivacy: 'low',
      maxGroupSize: 20,
      groupModel: 'enforced',
      durableHistory: false,
    },
  },
  configSchema: {
    fields: [
      {
        key: 'nodeUrl',
        label: 'nwaku node URL',
        kind: 'text',
        placeholder: 'http://127.0.0.1:8645',
        help:
          "Leave empty to go through Status's own nodes. To use a node you run instead, give the " +
          'REST endpoint of an nwaku node on the Status network (cluster 16, shard 32).',
      },
      {
        key: 'displayName',
        label: 'Display name',
        kind: 'text',
        help:
          'What Status shows instead of your chat key: 5 to 24 letters, digits, spaces, _ or -. ' +
          'Leave empty to stay a chat key.',
      },
    ],
  },
  async connect({ accountId, derive, config, storage }) {
    const { StatusSession } = await import('./adapter');
    return StatusSession.connect({
      derive,
      nodeUrl: config.nodeUrl ?? '',
      displayName: config.displayName,
      store: storage.messages,
      state: storage.protocolState('status'),
      media: {
        save: (messageId, bytes, mimeType) =>
          writeInlineAttachment(
            messageId,
            { filename: mimeType.replace('/', '.'), mimeType, data: bytesToBase64(bytes) },
            accountId
          ),
        load: async (uri, name, mimeType) =>
          base64ToBytes((await readInlineAttachment(uri, name, mimeType)).data),
      },
    });
  },
} satisfies ProtocolDescriptor;
