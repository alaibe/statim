import { selfIdFor, useChatStore } from '@/core/messaging/chat-store';
import type { ParticipantId } from '@/core/messaging/types';
import { contactsOf } from '@/features/contacts/contacts';
import { connectableProtocols } from '@/protocols';

import { chatLabels, displayNames, whenAccountReady, type CliHandler } from '../context';
import { CliError } from '../errors';
import { requireProtocol } from './protocols';

function connectedProtocols(flag: string | true | undefined) {
  const sessions = useChatStore.getState().sessions;
  const wanted = typeof flag === 'string' ? [requireProtocol(flag)] : connectableProtocols();
  const connected = wanted.filter((p) => sessions[p.id]);
  if (connected.length === 0) {
    throw new CliError(
      typeof flag === 'string'
        ? `${wanted[0].label} is not connected.`
        : 'No protocol is connected.',
      'unavailable'
    );
  }
  return connected;
}

/** The first protocol, in the app's order, that resolves the address. */
export async function resolveOn(
  flag: string | true | undefined,
  address: string
): Promise<{ protocol: string; id: ParticipantId }> {
  const protocols = connectedProtocols(flag);
  const store = useChatStore.getState();
  for (const protocol of protocols) {
    const id = await store.resolveParticipant(protocol.id, address).catch(() => null);
    if (id) return { protocol: protocol.id, id };
  }
  const reason =
    protocols.length === 1
      ? protocols[0].address.unreachable(address)
      : `No protocol knows "${address}".`;
  throw new CliError(reason, 'notFound');
}

export async function resolveAllOn(
  protocol: string,
  addresses: string[]
): Promise<ParticipantId[]> {
  const store = useChatStore.getState();
  return Promise.all(
    addresses.map(async (address) => {
      const id = await store.resolveParticipant(protocol, address).catch(() => null);
      if (!id)
        throw new CliError(requireProtocol(protocol).address.unreachable(address), 'notFound');
      return id;
    })
  );
}

export const peopleHandlers = {
  async new({ args, flags }) {
    await whenAccountReady();
    const { protocol, id } = await resolveOn(flags.protocol, args.address!);
    const chat = await useChatStore.getState().startDm(protocol, id);
    const title = (await chatLabels([chat])).get(chat.id)?.title ?? chat.title;
    return {
      data: { id: chat.id, title, protocol },
      text: `Chat ready: ${title}  ${chat.id}`,
    };
  },

  async resolve({ args, flags }) {
    await whenAccountReady();
    const found = await resolveOn(flags.protocol, args.address!);
    return { data: found, text: `${found.protocol}: ${found.id}` };
  },

  async contacts({ flags }) {
    await whenAccountReady();
    const state = useChatStore.getState();
    const protocol =
      typeof flags.protocol === 'string' ? requireProtocol(flags.protocol).id : undefined;
    const contacts = contactsOf(state.chats, (p) => selfIdFor(state, p)).filter(
      (p) => !protocol || p.protocol === protocol
    );
    const names: Record<string, string> = {};
    for (const protocol of new Set(contacts.map((p) => p.protocol))) {
      Object.assign(
        names,
        await displayNames(
          protocol,
          contacts.filter((p) => p.protocol === protocol).map((p) => p.id)
        )
      );
    }
    const data = contacts
      .map((p) => ({
        id: p.id,
        name: names[p.id] ?? p.id,
        protocol: p.protocol,
        chat: p.chatId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      data,
      text: data.length
        ? data.map((p) => `${p.name}  (${p.protocol})  ${p.chat}`)
        : 'No contacts yet.',
    };
  },
} satisfies Record<string, CliHandler>;
