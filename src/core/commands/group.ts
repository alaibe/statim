import { router } from 'expo-router';

import { selfIdFor, sessionFor, useChatStore } from '@/core/messaging/chat-store';
import { chatPermissions, type ChatPermissions } from '@/core/messaging/permissions';
import type { Chat, ChatId } from '@/core/messaging/types';
import { nameFrom, resolveParticipants } from '@/core/messaging/display-names';
import type { ComposerAction, SlashCommand } from '@/core/plugins/types';
import { W } from '@/design/widgets';

// The registry only offers these in a group, so the guard is just "is it still here".
function groupGuard(
  chatId: ChatId
): { ok: true; chat: Chat; permissions: ChatPermissions } | { ok: false; message: string } {
  const state = useChatStore.getState();
  const chat = state.chats.find((c) => c.id === chatId);

  if (!chat) return { ok: false, message: 'Chat not found.' };
  return { ok: true, chat, permissions: chatPermissions(chat, sessionFor(state, chatId)) };
}

async function resolveOn(
  chat: Chat,
  who: string
): Promise<{ ok: true; participantId: string | null } | { ok: false; message: string }> {
  const state = useChatStore.getState();
  const { protocol } = chat;
  if (!protocol || !state.sessions[protocol]) return { ok: false, message: 'Not connected yet.' };
  return { ok: true, participantId: await state.resolveParticipant(protocol, who) };
}

async function membersCard(chatId: ChatId, note?: string) {
  const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
  const protocol = chat?.protocol;
  const members = await useChatStore.getState().getMembers(chatId);
  const selfId = selfIdFor(useChatStore.getState(), protocol);
  const resolved = await resolveParticipants(
    protocol,
    members.map((m) => m.id)
  );

  const selfRole = chat?.selfRole ?? 'member';

  return {
    kind: 'widget' as const,
    fallback: note ?? `${members.length} members`,
    widget: W.card(
      [
        W.rows(
          members.map((m) => {
            const isSelf = m.id === selfId;
            return {
              label: isSelf ? 'You' : nameFrom(m.id, resolved),
              value: m.role,
              tone: m.role === 'member' ? undefined : ('brand' as const),
              actions: isSelf
                ? [{ label: 'Leave this group', command: '/leave', tone: 'danger' as const }]
                : [{ label: 'View profile', command: `/profile ${m.id}` }],
            };
          })
        ),
        W.text(
          note ??
            (selfRole === 'member'
              ? 'You are a member. Admins can add and remove people.'
              : `You are ${selfRole === 'owner' ? 'the owner' : 'an admin'}. /invite and /remove are available.`)
        ),
      ],
      { title: `${members.length} members`, icon: 'people-outline' }
    ),
  };
}

export const groupCommands: SlashCommand[] = [
  {
    name: 'profile',
    description: "Open a member's profile",
    showIn: ['group', 'dm'],
    usage: '/profile [member]',
    async run({ args, chatId }) {
      const [member] = args;
      // Core commands are handed a context that throws on any access, so this
      // goes through the imperative router.
      router.push({
        pathname: '/profile/[id]',
        params: member ? { id: chatId, member } : { id: chatId },
      });
      return { type: 'handled' };
    },
  },

  {
    name: 'members',
    aliases: ['who'],
    description: 'Who is in this group',
    showIn: ['group'],
    usage: '/members',
    async run({ chatId, respond }) {
      const guard = groupGuard(chatId);
      if (!guard.ok) return { type: 'error', message: guard.message };

      await respond(await membersCard(chatId));
      return { type: 'handled' };
    },
  },

  {
    name: 'invite',
    aliases: ['add'],
    description: 'Add someone to this group',
    showIn: ['group'],
    usage: '/invite <address | name.eth>',
    async run({ args, chatId, respond }) {
      const guard = groupGuard(chatId);
      if (!guard.ok) return { type: 'error', message: guard.message };
      if (!guard.permissions.addMembers) {
        return { type: 'error', message: 'Only admins can add people to this group.' };
      }

      const [who] = args;
      if (!who) return { type: 'error', message: 'Who? /invite vitalik.eth' };

      const resolved = await resolveOn(guard.chat, who);
      if (!resolved.ok) return { type: 'error', message: resolved.message };
      const { participantId } = resolved;
      if (!participantId) {
        return {
          type: 'error',
          message: `${who} has no XMTP inbox yet, so they cannot be added.`,
        };
      }

      await useChatStore.getState().addMembers(chatId, [participantId]);
      await respond(
        await membersCard(chatId, `Added ${who}. Everyone in the group sees the change.`)
      );
      return { type: 'handled' };
    },
  },

  {
    name: 'remove',
    aliases: ['kick'],
    description: 'Remove someone from this group',
    showIn: ['group'],
    usage: '/remove <address | participant id>',
    async run({ args, chatId, respond }) {
      const guard = groupGuard(chatId);
      if (!guard.ok) return { type: 'error', message: guard.message };
      if (!guard.permissions.removeMembers) {
        return { type: 'error', message: 'Only admins can remove people from this group.' };
      }

      const [who] = args;
      if (!who) return { type: 'error', message: 'Who? /remove 0xabc…' };

      const resolved = await resolveOn(guard.chat, who);
      if (!resolved.ok) return { type: 'error', message: resolved.message };
      const { participantId } = resolved;
      if (!participantId) return { type: 'error', message: `Could not resolve ${who}.` };
      if (participantId === selfIdFor(useChatStore.getState(), guard.chat.protocol)) {
        return { type: 'error', message: 'Use /leave to remove yourself.' };
      }

      await useChatStore.getState().removeMembers(chatId, [participantId]);
      await respond(
        await membersCard(
          chatId,
          `Removed ${who}. They keep messages they already had. MLS re-keys the group ` +
            'so they cannot read anything sent from now on.'
        )
      );
      return { type: 'handled' };
    },
  },

  {
    name: 'rename',
    description: 'Rename this group',
    showIn: ['group'],
    usage: '/rename <new name>',
    async run({ rest, chatId, respond }) {
      const guard = groupGuard(chatId);
      if (!guard.ok) return { type: 'error', message: guard.message };

      const title = rest.trim();
      if (!title) return { type: 'error', message: 'Call it what? /rename Weekend plans' };

      await useChatStore.getState().renameGroup(chatId, title);
      await respond(`Renamed to "${title}".`);
      return { type: 'handled' };
    },
  },

  {
    name: 'leave',
    description: 'Leave this group',
    showIn: ['group'],
    usage: '/leave',
    async run({ chatId }) {
      const guard = groupGuard(chatId);
      if (!guard.ok) return { type: 'error', message: guard.message };

      await useChatStore.getState().leaveGroup(chatId);
      return { type: 'notice', message: 'You left the group. Rejoining needs a fresh invite.' };
    },
  },
];

export const groupComposerActions: ComposerAction[] = [
  {
    id: 'members',
    label: 'Members',
    icon: 'people-outline',
    command: '/members',
    showIn: ['group'],
  },
];
