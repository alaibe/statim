import { useEffect, useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { errorMessage } from '@/core/errors';
import { selfIdFor, useChatStore } from '@/core/messaging/chat-store';
import type { ProtocolId } from '@/core/messaging/namespace';
import { isBridgedNetwork, type NetworkId } from '@/core/messaging/networks';
import type { ProtocolDescriptor } from '@/core/messaging/registry';
import { contactsOf } from '@/features/contacts/contacts';
import { openChatFromSheet } from '@/features/navigation/open';
import { networkLabel } from '@/features/protocols/presentation';
import { connectableProtocols } from '@/protocols';
import type { RemotePerson } from '@/protocols/matrix/provisioning';
import { addBy, bridgeLinks, type BridgeLink } from './bridged-networks';
import { useDisplayNames } from './use-display-names';

interface Participant {
  input: string;
  participantId: string;
  /** Their id on the far network, for someone found through a bridge. */
  remoteId?: string;
}

/** A chip on the screen: a protocol, or a network one of your Matrix bridges reaches. */
export interface Destination {
  id: NetworkId;
  label: string;
  descriptor: ProtocolDescriptor;
  bridge?: BridgeLink;
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

  const protocols = connectableProtocols().filter((p) => sessions[p.id]);
  const matrix = protocols.find((p) => p.id === 'matrix');
  const matrixSession = sessions.matrix;
  const [links, setLinks] = useState<BridgeLink[]>([]);
  useEffect(() => {
    if (!matrixSession) return;
    let cancelled = false;
    void bridgeLinks(matrixSession).then((found) => {
      if (!cancelled) setLinks(found);
    });
    return () => {
      cancelled = true;
    };
  }, [matrixSession]);

  const contacts = contactsOf(chats, (p) => selfIdFor({ sessions }, p));
  const bridged = [
    ...new Set([
      ...links.map((link) => link.network),
      ...contacts.map((contact) => contact.network).filter(isBridgedNetwork),
    ]),
  ];
  const available: Destination[] = [
    ...protocols.map((descriptor) => ({ id: descriptor.id, label: descriptor.label, descriptor })),
    ...(matrix
      ? bridged
          .map((network) => ({
            id: network,
            label: networkLabel(network),
            descriptor: matrix,
            bridge: links.find((link) => link.network === network),
          }))
          .sort((a, b) => a.label.localeCompare(b.label))
      : []),
  ];

  const [chosen, setChosen] = useState<NetworkId | null>(null);
  const destination = available.find((d) => d.id === chosen) ?? available[0];
  const active = destination?.id ?? null;
  const descriptor = destination?.descriptor;
  const protocol: ProtocolId | null = descriptor?.id ?? null;
  const bridgedHere = !!destination && isBridgedNetwork(destination.id);
  const adding: 'address' | 'search' | 'lookup' | null = bridgedHere
    ? addBy(destination.bridge)
    : 'address';
  const [results, setResults] = useState<RemotePerson[]>([]);

  const [draft, setDraft] = useState('');
  const draftRef = useRef<TextInput>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isGroup = participants.length > 1;
  const groupName = defaultGroupName(participants);

  const { nameFor } = useDisplayNames(contacts);
  const selves = destination?.bridge?.selves;
  const known = groupByInitial(
    contacts
      .filter((contact) => contact.network === active)
      .map((contact) => ({ ...contact, name: nameFor(contact.id) }))
      .filter((person) => !selves?.has(person.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  function chooseProtocol(next: NetworkId) {
    if (next === active) return;
    setChosen(next);
    setParticipants([]);
    setResults([]);
    setError(null);
  }

  function changeDraft(text: string) {
    setDraft(text);
    if (error) setError(null);
  }

  async function addParticipant() {
    const input = draft.trim();
    if (!input) return;
    if (bridgedHere) return findOnBridge(input);

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

  /** A bridge finds people its own way: by search, or by an exact username, phone or email. */
  async function findOnBridge(input: string) {
    const link = destination?.bridge;
    if (!link || !adding || !destination) return;
    setBusy(true);
    setError(null);
    try {
      const found =
        adding === 'search'
          ? await link.provisioning.search(input)
          : [await link.provisioning.resolve(input)];
      const people = found.filter((person) => !link.selves.has((person.name ?? '').toLowerCase()));
      setResults(people);
      if (people.length === 0) setError(`Nobody on ${destination.label} matches ${input}.`);
    } catch (e) {
      setError(errorMessage(e, `Could not look that up on ${destination.label}`));
    }
    setBusy(false);
  }

  function pickResult(person: RemotePerson) {
    setError(null);
    setParticipants([
      {
        input: person.name ?? person.id,
        participantId: person.mxid ?? person.id,
        remoteId: person.id,
      },
    ]);
  }

  const selectedIds = new Set(participants.map((r) => r.participantId));

  function toggleParticipant(id: string, name: string) {
    setError(null);
    setParticipants((current) =>
      current.some((r) => r.participantId === id)
        ? current.filter((r) => r.participantId !== id)
        : bridgedHere
          ? [{ input: name, participantId: id }]
          : [...current, { input: name, participantId: id }]
    );
  }

  function removeParticipant(id: string) {
    setParticipants((current) => current.filter((r) => r.participantId !== id));
  }

  const only = participants.length === 1 ? participants[0] : null;
  const existingDm = only
    ? (contacts.find((p) => p.network === active && p.id === only.participantId)?.chatId ?? null)
    : null;

  async function start() {
    if (existingDm) {
      openChatFromSheet(existingDm);
      return;
    }

    if (participants.length === 0 || !protocol) return;

    setBusy(true);
    setError(null);
    const starting = isGroup
      ? startGroup(
          protocol,
          participants.map((r) => r.participantId),
          title.trim() || groupName
        )
      : startPerson(protocol, participants[0]);
    try {
      const chat = await starting;
      openChatFromSheet(chat.id);
    } catch (e) {
      setError(errorMessage(e, 'Could not start that chat'));
    }
    setBusy(false);
  }

  /** On a bridge, the bridge opens the DM on the far network before its room is opened here. */
  async function startPerson(on: ProtocolId, person: Participant) {
    const link = destination?.bridge;
    if (link && person.remoteId) {
      const created = await link.provisioning.createDm(person.remoteId);
      return startDm(on, created.mxid ?? person.participantId);
    }
    return startDm(on, person.participantId);
  }

  return {
    sessions,
    available,
    active,
    destination,
    adding,
    results,
    pickResult,
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
