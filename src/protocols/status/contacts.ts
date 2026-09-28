/**
 * Status's contact requests: each side keeps its own state and the other
 * side's last known state, each with a Lamport clock, and every DM message
 * carries both so the two converge. A DM only shows in the Status app once
 * both sides have added each other.
 */
import type { PropagatedState } from './messages';

export const RequestState = {
  NONE: 0,
  SENT: 2,
  RECEIVED: 3,
  DISMISSED: 4,
} as const;

export interface ContactState {
  localState: number;
  localClock: number;
  remoteState: number;
  remoteClock: number;
  displayName?: string;
  /** The clock of the newest profile update applied. */
  updatedAt: number;
  /** The id of the request message they sent, which accepting names. */
  requestId?: string;
  /** They have written to us, so a chat with them is theirs until we add them. */
  heardFrom?: boolean;
  /** Their profile picture, saved on this device. */
  picture?: string;
  /** The clock of the newest identity they sent, which carries the picture. */
  identityClock?: number;
}

export interface ContactChange {
  contact: ContactState;
  processed: boolean;
  newRequest: boolean;
  sendBackState: boolean;
}

export const NEW_CONTACT: ContactState = {
  localState: RequestState.NONE,
  localClock: 0,
  remoteState: RequestState.NONE,
  remoteClock: 0,
  updatedAt: 0,
};

export function added(contact: ContactState): boolean {
  return contact.localState === RequestState.SENT;
}

export function hasAddedUs(contact: ContactState): boolean {
  return contact.remoteState === RequestState.RECEIVED;
}

export function mutual(contact: ContactState): boolean {
  return added(contact) && hasAddedUs(contact);
}

export function dismissed(contact: ContactState): boolean {
  return contact.localState === RequestState.DISMISSED;
}

function unchanged(contact: ContactState): ContactChange {
  return { contact, processed: false, newRequest: false, sendBackState: false };
}

function setLocal(contact: ContactState, state: number, clock: number): ContactChange {
  if (clock <= contact.localClock) return unchanged(contact);
  return {
    contact: { ...contact, localState: state, localClock: clock },
    processed: true,
    newRequest: false,
    sendBackState: false,
  };
}

export function requestSent(contact: ContactState, clock: number): ContactChange {
  return setLocal(contact, RequestState.SENT, clock);
}

export function requestDismissed(contact: ContactState, clock: number): ContactChange {
  return setLocal(contact, RequestState.DISMISSED, clock);
}

function receivedFrom(change: ContactChange, clock: number): ContactChange {
  const { contact } = change;
  if (clock <= contact.remoteClock) return change;
  return {
    ...change,
    contact: { ...contact, remoteState: RequestState.RECEIVED, remoteClock: clock },
    processed: true,
    newRequest: change.newRequest || contact.remoteState === RequestState.NONE,
  };
}

function retractedBy(change: ContactChange, clock: number): ContactChange {
  const { contact } = change;
  if (clock <= contact.remoteClock) return change;
  const keepLocal = contact.localState === RequestState.DISMISSED;
  return {
    ...change,
    contact: {
      ...contact,
      localState: keepLocal ? contact.localState : RequestState.NONE,
      localClock: keepLocal ? contact.localClock : clock,
      remoteState: RequestState.NONE,
      remoteClock: clock,
    },
    processed: true,
  };
}

export function requestReceived(contact: ContactState, clock: number): ContactChange {
  return receivedFrom(unchanged(contact), clock);
}

export function remoteRetracted(contact: ContactState, clock: number): ContactChange {
  return retractedBy(unchanged(contact), clock);
}

/** Their view of both sides, as a DM message or profile update carries it. */
export function propagatedStateReceived(
  contact: ContactState,
  state: PropagatedState
): ContactChange {
  let change = unchanged(contact);
  const expectedLocalState = state.remoteState;
  const expectedLocalClock = state.remoteClock;

  if (expectedLocalClock < contact.localClock && expectedLocalState !== contact.localState) {
    change = { ...change, processed: true, sendBackState: true };
  }

  if (
    expectedLocalClock > contact.localClock &&
    contact.localState !== RequestState.DISMISSED &&
    expectedLocalState === RequestState.NONE
  ) {
    change = {
      ...change,
      processed: true,
      contact: {
        ...change.contact,
        localClock: expectedLocalClock,
        localState: RequestState.NONE,
        remoteState: RequestState.NONE,
      },
    };
  }

  if (state.localClock > change.contact.remoteClock) {
    if (state.localState === RequestState.SENT) change = receivedFrom(change, state.localClock);
    else if (state.localState === RequestState.NONE) change = retractedBy(change, state.localClock);
  }
  return change;
}

export function propagatedState(contact: ContactState): PropagatedState {
  return {
    localClock: contact.localClock,
    localState: contact.localState,
    remoteClock: contact.remoteClock,
    remoteState: contact.remoteState,
  };
}
