import { useChatStore, xmtpSessionFor } from '@/core/messaging/chat-store';
import { protocolOf } from '@/core/messaging/namespace';
import type { ChatId, ParticipantId } from '@/core/messaging/types';
import { liveViews } from '@/core/plugins/live';
import type { PluginContext, SlashCommand, TextPreview } from '@/core/plugins/types';
import { W } from '@/design/widgets';

import { MOVE_ACK, moveInviteText, parseMoveInvite } from './move-invite';

interface Move {
  chatId: ChatId;
  participants: ParticipantId[];
  name: string;
}

/** Keyed by the lowercased XMTP address the invite carried. */
type Moves = Record<string, Move>;

const MOVES_KEY = 'moves';

const readMoves = async (context: PluginContext) =>
  (await context.storage.get<Moves>(MOVES_KEY)) ?? {};

export async function moveNames(context: PluginContext): Promise<Record<ParticipantId, string>> {
  return Object.fromEntries(
    Object.values(await readMoves(context)).flatMap(({ participants, name }) =>
      participants.map((id) => [id, name])
    )
  );
}

export const movePreview: TextPreview = {
  view: 'move',
  match: (text) => {
    const address = parseMoveInvite(text);
    return address ? [address] : null;
  },
};

export function moveCommand(context: PluginContext): SlashCommand {
  return {
    name: 'move',
    description: 'Continue this DM on XMTP, end-to-end encrypted',
    usage: '/move',
    showIn: ['dm'],
    async run({ chatId, args }) {
      if (protocolOf(chatId) === 'xmtp') {
        return { type: 'error', message: 'This chat is already on XMTP.' };
      }
      const state = useChatStore.getState();
      if (!xmtpSessionFor(state)) return { type: 'error', message: 'Not connected to XMTP yet.' };

      const [verb, address] = args;
      if (verb !== 'accept') {
        await context.chat.sendText(chatId, moveInviteText(context.account.address));
        return { type: 'handled' };
      }
      if (!address) return { type: 'error', message: 'Which address? /move accept 0x…' };
      const key = address.toLowerCase();
      if (key === context.account.address.toLowerCase()) {
        return { type: 'error', message: 'That is your own address.' };
      }

      const moves = await readMoves(context);
      const moved = moves[key];
      if (moved) {
        context.ui.openChat(moved.chatId);
        return { type: 'handled' };
      }

      const dm = await context.chat.startDm(address);
      if (!dm) return { type: 'error', message: 'That address cannot receive XMTP messages yet.' };
      const [, members] = await Promise.all([
        context.chat.sendText(dm, MOVE_ACK),
        context.chat.members(dm),
      ]);

      const name = state.chats.find((c) => c.id === chatId)?.title ?? address;
      const participants = members.filter((id) => id !== context.account.participantId);
      await context.storage.set(MOVES_KEY, { ...moves, [key]: { chatId: dm, participants, name } });
      context.ui.openChat(dm);
      return { type: 'handled' };
    },
  };
}

export function moveViews(context: PluginContext) {
  return liveViews(context, {
    move: async ([address]) => {
      const moved = Boolean((await readMoves(context))[address.toLowerCase()]);
      return {
        kind: 'widget',
        fallback: 'Continue on XMTP',
        widget: W.card(
          [
            W.text(
              moved
                ? 'This chat continues on XMTP.'
                : 'They asked to continue this chat on XMTP, where it is end-to-end encrypted.'
            ),
            W.actions([
              {
                label: moved ? 'Open XMTP chat' : 'Continue on XMTP',
                command: `/move accept ${address}`,
                tone: moved ? undefined : 'brand',
              },
            ]),
          ],
          { title: 'Continue on XMTP', icon: 'lock-closed-outline' }
        ),
      };
    },
  });
}
