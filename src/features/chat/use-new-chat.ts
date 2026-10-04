import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { errorMessage } from '@/core/errors';
import { selfIdFor, useChatStore } from '@/core/messaging/chat-store';
import { nameList } from '@/core/messaging/preview';
import { isBridgedNetwork, type NetworkId } from '@/core/messaging/networks';
import type { ChatSession } from '@/core/messaging/protocol';
import type { ProtocolDescriptor } from '@/core/messaging/registry';
import { contactsOf, type Contact } from '@/features/contacts/contacts';
import { openChatFromSheet } from '@/features/navigation/open';
import { networkLabel } from '@/features/protocols/presentation';
import { useKeyedLoad } from '@/lib/use-keyed-load';
import { connectableProtocols } from '@/protocols';
import type { MatrixCapabilities } from '@/protocols/matrix/provisioning';
import {
  bridgeLinks,
  candidateOf,
  type BridgeAddBy,
  type BridgeLink,
  type Candidate,
} from './bridged-networks';
import { useDisplayNames } from './use-display-names';

/** A chip on the screen: a protocol, or a network one of your Matrix bridges reaches. */
export interface Destination {
  id: NetworkId;
  label: string;
  descriptor: ProtocolDescriptor;
  bridged: boolean;
  /** Absent for a bridged network you have chats on but are not signed in to on the bridge. */
  bridge?: BridgeLink;
  adding: 'address' | BridgeAddBy;
  /** Your own names on the network, lowercased. */
  selves: ReadonlySet<string>;
}

type KnownRow = { kind: 'header'; letter: string } | ({ kind: 'person' } & Candidate);

const NO_SELVES: ReadonlySet<string> = new Set();
const NO_LINKS: BridgeLink[] = [];

export function useDestinations() {
  const sessions = useChatStore((s) => s.sessions);
  const chats = useChatStore((s) => s.chats);
  const matrix = sessions.matrix as (ChatSession & Partial<MatrixCapabilities>) | undefined;
  const provisioningFor = matrix?.bridgeProvisioning?.bind(matrix);
  const { value: links = NO_LINKS } = useKeyedLoad(
    provisioningFor && matrix ? matrix.self.address : null,
    () => bridgeLinks(provisioningFor ?? (() => null))
  );

  const contacts = contactsOf(chats, (p) => selfIdFor({ sessions }, p));
  const protocols = connectableProtocols().filter((p) => sessions[p.id]);
  const carrier = protocols.find((p) => p.id === 'matrix');
  const bridged = [
    ...new Set([
      ...links.map((link) => link.network),
      ...contacts.map((contact) => contact.network).filter(isBridgedNetwork),
    ]),
  ];
  const available: Destination[] = [
    ...protocols.map((descriptor) => ({
      id: descriptor.id,
      label: networkLabel(descriptor.id),
      descriptor,
      bridged: false,
      adding: 'address' as const,
      selves: NO_SELVES,
    })),
    ...(carrier
      ? bridged
          .map((network) => {
            const bridge = links.find((link) => link.network === network);
            return {
              id: network,
              label: networkLabel(network),
              descriptor: carrier,
              bridged: true,
              bridge,
              adding: bridge?.addBy ?? null,
              selves: bridge?.selves ?? NO_SELVES,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label))
      : []),
  ];

  const [chosen, choose] = useState<NetworkId | null>(null);
  const destination = available.find((d) => d.id === chosen) ?? available[0];
  return { sessions, contacts, available, destination, choose };
}

function groupByInitial(people: Candidate[]): KnownRow[] {
  const out: KnownRow[] = [];
  let letter = '';
  for (const person of people) {
    const initial = person.name.charAt(0).toUpperCase();
    if (initial !== letter) {
      letter = initial;
      out.push({ kind: 'header', letter });
    }
    out.push({ kind: 'person', ...person });
  }
  return out;
}

function defaultGroupName(participants: Candidate[]): string {
  return nameList(participants, (r) => r.name.split('.')[0].slice(0, 10));
}

export function useNewChat(destination: Destination, contacts: readonly Contact[]) {
  const resolveParticipant = useChatStore((s) => s.resolveParticipant);
  const startDm = useChatStore((s) => s.startDm);
  const startGroup = useChatStore((s) => s.startGroup);
  const { descriptor, bridge } = destination;
  const protocol = descriptor.id;
  const mine = (name: string) => destination.selves.has(name.toLowerCase());

  const [draft, setDraft] = useState('');
  const draftRef = useRef<TextInput>(null);
  const [participants, setParticipants] = useState<Candidate[]>([]);
  const [results, setResults] = useState<Candidate[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isGroup = participants.length > 1;
  const groupName = defaultGroupName(participants);

  const here = contacts.filter((contact) => contact.network === destination.id);
  const { nameFor } = useDisplayNames(here);
  const known = groupByInitial(
    here
      .map((contact) => ({ participantId: contact.id, name: nameFor(contact.id) }))
      .filter((person) => !mine(person.name))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  function changeDraft(text: string) {
    setDraft(text);
    if (error) setError(null);
  }

  async function addParticipant() {
    const input = draft.trim();
    if (!input) return;
    if (bridge) return find(bridge, input);

    setBusy(true);
    setError(null);
    let participantId: string | null;
    try {
      participantId = await resolveParticipant(protocol, input);
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
    setParticipants((current) => [...current, { participantId, name: input }]);
    setDraft('');
    draftRef.current?.clear();
  }

  async function find(link: BridgeLink, input: string) {
    setBusy(true);
    setError(null);
    try {
      const found =
        link.addBy === 'search'
          ? await link.provisioning.search(input)
          : [await link.provisioning.resolve(input)];
      const people = found.map(candidateOf).filter((person) => !mine(person.name));
      setResults(people);
      if (people.length === 0) setError(`Nobody on ${destination.label} matches ${input}.`);
    } catch (e) {
      setError(errorMessage(e, `Could not look that up on ${destination.label}`));
    }
    setBusy(false);
  }

  const selectedIds = new Set(participants.map((r) => r.participantId));

  function toggle(person: Candidate) {
    setError(null);
    setParticipants((current) =>
      current.some((r) => r.participantId === person.participantId)
        ? current.filter((r) => r.participantId !== person.participantId)
        : destination.bridged
          ? [person]
          : [...current, person]
    );
  }

  function removeParticipant(id: string) {
    setParticipants((current) => current.filter((r) => r.participantId !== id));
  }

  const only = participants.length === 1 ? participants[0] : null;
  const existingDm = only
    ? (here.find((contact) => contact.id === only.participantId)?.chatId ?? null)
    : null;

  async function startWith(person: Candidate) {
    if (bridge && person.remoteId) {
      const created = await bridge.provisioning.createDm(person.remoteId);
      return startDm(protocol, created.mxid ?? person.participantId);
    }
    return startDm(protocol, person.participantId);
  }

  async function start() {
    if (existingDm) {
      openChatFromSheet(existingDm);
      return;
    }
    if (participants.length === 0) return;

    setBusy(true);
    setError(null);
    const starting = isGroup
      ? startGroup(
          protocol,
          participants.map((r) => r.participantId),
          title.trim() || groupName
        )
      : startWith(participants[0]);
    try {
      const chat = await starting;
      openChatFromSheet(chat.id);
    } catch (e) {
      setError(errorMessage(e, 'Could not start that chat'));
    }
    setBusy(false);
  }

  return {
    draft,
    draftRef,
    participants,
    results,
    groupName,
    error,
    busy,
    isGroup,
    known,
    selectedIds,
    existingDm,
    changeDraft,
    addParticipant,
    toggle,
    removeParticipant,
    setTitle,
    start,
  };
}
