import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { errorMessage } from '@/core/errors';
import { selfIdFor, useChatStore } from '@/core/messaging/chat-store';
import type { ProtocolId } from '@/core/messaging/namespace';
import { contactsOf } from '@/features/contacts/contacts';
import { openChatFromSheet } from '@/features/navigation/open';
import { connectableProtocols } from '@/protocols';
import { useDisplayNames } from './use-display-names';

interface Participant {
  input: string;
  participantId: string;
}

type KnownRow =
  | { kind: 'header'; letter: string }
  | { kind: 'person'; id: string; name: string; chatId: string };

function groupByInitial(people: { id: string; name: string; chatId: string }[]): KnownRow[] {
  const out: KnownRow[] = [];
  let letter = '';
  for (const person of people) {
    const initial = person.name.charAt(0).toUpperCase();
    if (initial !== letter) {
      letter = initial;
      out.push({ kind: 'header', letter });
    }
    out.push({
      kind: 'person',
      id: person.id,
      name: person.name,
      chatId: person.chatId,
    });
  }
  return out;
}

function defaultGroupName(participants: Participant[]): string {
  const names = participants.slice(0, 2).map((r) => r.input.split('.')[0].slice(0, 10));
  const rest = participants.length - names.length;
  return rest > 0 ? `${names.join(', ')} +${rest}` : names.join(', ');
}

export function useNewChat() {
  const sessions = useChatStore((s) => s.sessions);
  const chats = useChatStore((s) => s.chats);
  const resolveParticipant = useChatStore((s) => s.resolveParticipant);
  const startDm = useChatStore((s) => s.startDm);
  const startGroup = useChatStore((s) => s.startGroup);

  const available = connectableProtocols().filter((p) => sessions[p.id]);

  const [protocol, setProtocol] = useState<ProtocolId | null>(null);
  const active = protocol ?? available[0]?.id ?? null;
  const descriptor = available.find((p) => p.id === active);

  const [draft, setDraft] = useState('');
  const draftRef = useRef<TextInput>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isGroup = participants.length > 1;
  const groupName = defaultGroupName(participants);

  const contacts = contactsOf(chats, (p) => selfIdFor({ sessions }, p));
  const { nameFor } = useDisplayNames(contacts);
  const known = groupByInitial(
    contacts
      .filter((contact) => contact.protocol === active)
      .map((contact) => ({ ...contact, name: nameFor(contact.id) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  function chooseProtocol(next: ProtocolId) {
    if (next === active) return;
    setProtocol(next);
    setParticipants([]);
    setError(null);
  }

  function changeDraft(text: string) {
    setDraft(text);
    if (error) setError(null);
  }

  async function addParticipant() {
    const input = draft.trim();
    if (!input) return;

    if (!descriptor) {
      setError('Still connecting to that protocol. Try again in a moment.');
      return;
    }
    setBusy(true);
    setError(null);
    let participantId: string | null;
    try {
      participantId = await resolveParticipant(descriptor.id, input);
    } catch (e) {
      setError(errorMessage(e, 'Could not check that address'));
      setBusy(false);
      return;
    }
    setBusy(false);

    if (!participantId) {
      setError(descriptor.address.unreachable(input));
      return;
    }
    if (participants.some((r) => r.participantId === participantId)) {
      setError(`${input} is already on the list.`);
      return;
    }
    setParticipants((current) => [...current, { input, participantId }]);
    setDraft('');
    draftRef.current?.clear();
  }

  const selectedIds = new Set(participants.map((r) => r.participantId));

  function toggleParticipant(id: string, name: string) {
    setError(null);
    setParticipants((current) =>
      current.some((r) => r.participantId === id)
        ? current.filter((r) => r.participantId !== id)
        : [...current, { input: name, participantId: id }]
    );
  }

  function removeParticipant(id: string) {
    setParticipants((current) => current.filter((r) => r.participantId !== id));
  }

  const only = participants.length === 1 ? participants[0] : null;
  const existingDm = only
    ? (contacts.find((p) => p.protocol === active && p.id === only.participantId)?.chatId ?? null)
    : null;

  async function start() {
    if (existingDm) {
      openChatFromSheet(existingDm);
      return;
    }

    if (participants.length === 0 || !active) return;

    setBusy(true);
    setError(null);
    const starting = isGroup
      ? startGroup(
          active,
          participants.map((r) => r.participantId),
          title.trim() || groupName
        )
      : startDm(active, participants[0].participantId);
    try {
      const chat = await starting;
      openChatFromSheet(chat.id);
    } catch (e) {
      setError(errorMessage(e, 'Could not start that chat'));
    }
    setBusy(false);
  }

  return {
    sessions,
    available,
    active,
    descriptor,
    draft,
    draftRef,
    participants,
    groupName,
    error,
    busy,
    isGroup,
    known,
    selectedIds,
    existingDm,
    chooseProtocol,
    changeDraft,
    addParticipant,
    toggleParticipant,
    removeParticipant,
    setTitle,
    start,
  };
}
