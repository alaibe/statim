import { PIN_LENGTH, type PinCheck } from '@/core/account/pin';

/** Unlocking is the lock screen; the other three are the screens in Settings. */
export type PinFlowKind = 'unlock' | 'set' | 'change' | 'off';

export type SettingsPinFlow = Exclude<PinFlowKind, 'unlock'>;

export type PinStage =
  | { name: 'intro' }
  | { name: 'current' }
  | { name: 'choose' }
  | { name: 'confirm'; chosen: string }
  | { name: 'done' };

/** What the screen has to go and do before the flow can move on. */
export type PinTask =
  | { run: 'check'; pin: string }
  | { run: 'save'; pin: string }
  | { run: 'remove' };

export type PinNote =
  | { kind: 'mismatch' }
  | { kind: 'wrong' }
  | { kind: 'wait'; until: number }
  | { kind: 'failed'; message: string };

export interface PinFlowState {
  kind: PinFlowKind;
  stage: PinStage;
  digits: string;
  note: PinNote | null;
  /** Bumped by every rejected entry, which shakes the dots. */
  shakes: number;
  task: PinTask | null;
}

export type PinFlowEvent =
  | { type: 'begin' }
  | { type: 'digit'; digit: string }
  | { type: 'delete' }
  | { type: 'checked'; check: PinCheck }
  | { type: 'wait'; until: number }
  | { type: 'finished' }
  | { type: 'failed'; message: string };

/** Without a PIN there is only setting one; with one, changing it unless turning it off was asked for. */
export function pinFlowKind(requested: 'change' | 'off', pinSet: boolean): SettingsPinFlow {
  if (!pinSet) return 'set';
  return requested === 'off' ? 'off' : 'change';
}

export function startPinFlow(kind: PinFlowKind): PinFlowState {
  return {
    kind,
    stage: kind === 'set' ? { name: 'intro' } : { name: 'current' },
    digits: '',
    note: null,
    shakes: 0,
    task: null,
  };
}

export function advancePinFlow(state: PinFlowState, event: PinFlowEvent): PinFlowState {
  switch (event.type) {
    case 'begin':
      return state.stage.name === 'intro' ? { ...state, stage: { name: 'choose' } } : state;
    case 'digit':
      return typed(state, event.digit);
    case 'delete':
      return takesDigits(state) ? { ...state, digits: state.digits.slice(0, -1) } : state;
    case 'checked':
      return state.task?.run === 'check' ? checked(state, event.check) : state;
    case 'wait':
      return { ...state, digits: '', note: { kind: 'wait', until: event.until } };
    case 'finished':
      return { ...state, stage: { name: 'done' }, task: null };
    case 'failed':
      return { ...state, digits: '', task: null, note: { kind: 'failed', message: event.message } };
  }
}

function takesDigits(state: PinFlowState): boolean {
  const { name } = state.stage;
  return state.task === null && (name === 'current' || name === 'choose' || name === 'confirm');
}

function typed(state: PinFlowState, digit: string): PinFlowState {
  if (!takesDigits(state) || !/^\d$/.test(digit) || state.digits.length >= PIN_LENGTH) {
    return state;
  }

  const digits = state.digits + digit;
  const next = { ...state, digits, note: null };
  if (digits.length < PIN_LENGTH) return next;

  switch (state.stage.name) {
    case 'current':
      return { ...next, task: { run: 'check', pin: digits } };
    case 'choose':
      return { ...next, stage: { name: 'confirm', chosen: digits }, digits: '' };
    case 'confirm':
      return digits === state.stage.chosen
        ? { ...next, task: { run: 'save', pin: digits } }
        : {
            ...next,
            stage: { name: 'choose' },
            digits: '',
            note: { kind: 'mismatch' },
            shakes: state.shakes + 1,
          };
    default:
      return state;
  }
}

function checked(state: PinFlowState, check: PinCheck): PinFlowState {
  switch (check.result) {
    case 'correct':
      if (state.kind === 'unlock') return { ...state, stage: { name: 'done' }, task: null };
      return state.kind === 'off'
        ? { ...state, task: { run: 'remove' } }
        : { ...state, stage: { name: 'choose' }, digits: '', task: null };
    case 'wrong':
      return {
        ...state,
        digits: '',
        task: null,
        shakes: state.shakes + 1,
        note: check.lockedUntil ? { kind: 'wait', until: check.lockedUntil } : { kind: 'wrong' },
      };
    case 'waiting':
      return { ...state, digits: '', task: null, note: { kind: 'wait', until: check.lockedUntil } };
  }
}
