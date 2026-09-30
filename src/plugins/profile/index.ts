import { isLocalChat } from '@/core/messaging/bots';
import type { Plugin } from '@/core/plugins/types';
import { W, type Widget } from '@/design/widgets';
import {
  CoinType,
  looksLikeEnsName,
  lookupName,
  resolveName,
  resolveNameForCoin,
} from '@/lib/evm/ens';

import { moveCommand, moveNames, movePreview, moveViews } from './move';

export const profilePlugin: Plugin = {
  manifest: {
    id: 'profile',
    name: 'Names & addresses',
    description:
      'Share your address in a chat, look up what an ENS name points at, and continue a DM on XMTP.',
    version: '1.0.0',
    icon: 'person-circle-outline',
    permissions: ['account.read', 'chat.read', 'chat.send', 'network', 'storage'],
  },

  setup(context) {
    return {
      views: moveViews(context),
      textPreviews: [movePreview],
      names: () => moveNames(context),
      commands: [
        moveCommand(context),
        {
          name: 'address',
          aliases: ['myaddress'],
          description: 'Show or share your address',
          showIn: ['dm', 'group'],
          usage: '/address',
          async run({ chatId, context, respond }) {
            const address = context.account.address;

            if (isLocalChat(chatId)) {
              const name = await lookupName(address).catch(() => null);
              await respond({
                kind: 'widget',
                fallback: `Your address: ${address}`,
                widget: W.card(
                  [
                    ...(name ? [W.stat(name, { label: 'Your ENS name' })] : []),
                    W.code(address, { label: 'Your address' }),
                    W.text('Anyone can message this address, or send to it.'),
                  ],
                  { title: 'Address', icon: 'finger-print-outline' }
                ),
              });
              return { type: 'handled' };
            }

            await context.chat.sendText(chatId, `My address: ${address}`);
            return { type: 'handled' };
          },
        },
        {
          name: 'ens',
          description: 'Look up an ENS name, including its Bitcoin record',
          showIn: ['dm', 'group'],
          usage: '/ens <name.eth>',
          async run({ args, respond }) {
            const [name] = args;
            if (!name) return { type: 'error', message: 'Which name? /ens vitalik.eth' };
            if (!looksLikeEnsName(name)) {
              return { type: 'error', message: `"${name}" does not look like an ENS name.` };
            }

            const [eth, btc] = await Promise.all([
              resolveName(name),
              resolveNameForCoin(name, CoinType.bitcoin),
            ]);

            if (!eth && !btc) {
              return { type: 'error', message: `${name} does not resolve to anything.` };
            }

            const children: Widget[] = [];
            if (eth) children.push(W.code(eth, { label: 'Ethereum' }));
            if (btc) children.push(W.code(btc, { label: 'Bitcoin' }));
            else {
              children.push(
                W.text(
                  'No Bitcoin record. ENS can hold one per ENSIP-9; this owner has not set it.'
                )
              );
            }
            if (eth) {
              children.push(
                W.actions([{ label: 'Balance', command: `/balance ${name} --chain ethereum` }])
              );
            }

            await respond({
              kind: 'widget',
              fallback: `${name} → ${eth ?? btc}`,
              widget: W.card(children, { title: name, icon: 'pricetag-outline' }),
            });
            return { type: 'handled' };
          },
        },
      ],
    };
  },
};
