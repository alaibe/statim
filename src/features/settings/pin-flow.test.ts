import {
  advancePinFlow,
  type PinFlowEvent,
  type PinFlowState,
  pinFlowKind,
  startPinFlow,
} from './pin-flow';

const run = (state: PinFlowState, ...events: PinFlowEvent[]) =>
  events.reduce(advancePinFlow, state);
const type = (pin: string): PinFlowEvent[] =>
  [...pin].map((digit) => ({ type: 'digit', digit }) as const);

describe('which flow opens', () => {
  it('sets a PIN when there is none, whatever was asked', () => {
    expect(pinFlowKind(undefined, false)).toBe('set');
    expect(pinFlowKind('off', false)).toBe('set');
  });

  it('changes or turns off a PIN that exists', () => {
    expect(pinFlowKind(undefined, true)).toBe('change');
    expect(pinFlowKind('off', true)).toBe('off');
  });
});

describe('setting a PIN', () => {
  const chosen = () => run(startPinFlow('set'), { type: 'begin' }, ...type('135790'));

  it('explains before it asks for anything', () => {
    const state = startPinFlow('set');
    expect(state.stage).toEqual({ name: 'intro' });
    expect(run(state, ...type('1'))).toBe(state);
  });

  it('fills the dots and moves on to confirming on the sixth digit', () => {
    const typing = run(startPinFlow('set'), { type: 'begin' }, ...type('13579'));
    expect(typing).toMatchObject({ stage: { name: 'choose' }, digits: '13579' });

    expect(chosen()).toMatchObject({
      stage: { name: 'confirm', chosen: '135790' },
      digits: '',
      task: null,
    });
  });

  it('takes back a digit, and ignores anything that is not one', () => {
    const state = run(
      startPinFlow('set'),
      { type: 'begin' },
      ...type('12'),
      { type: 'delete' },
      { type: 'digit', digit: 'x' }
    );
    expect(state.digits).toBe('1');
  });

  it('saves once the PIN is entered the same way twice', () => {
    const state = run(chosen(), ...type('135790'));
    expect(state.task).toEqual({ run: 'save', pin: '135790' });

    expect(run(state, { type: 'digit', digit: '1' })).toBe(state);
    expect(run(state, { type: 'finished' }).stage).toEqual({ name: 'done' });
  });

  it('shakes and starts again from choosing when the two do not match', () => {
    const state = run(chosen(), ...type('135791'));

    expect(state).toMatchObject({
      stage: { name: 'choose' },
      digits: '',
      note: { kind: 'mismatch' },
      shakes: 1,
      task: null,
    });
    expect(run(state, ...type('2')).note).toBeNull();
  });

  it('says why when saving fails, and lets the user try again', () => {
    const state = run(chosen(), ...type('135790'), { type: 'failed', message: 'Keychain' });
    expect(state).toMatchObject({
      stage: { name: 'confirm', chosen: '135790' },
      digits: '',
      task: null,
      note: { kind: 'failed', message: 'Keychain' },
    });
  });
});

describe('changing a PIN', () => {
  const entered = () => run(startPinFlow('change'), ...type('112233'));

  it('checks the current PIN first', () => {
    expect(startPinFlow('change').stage).toEqual({ name: 'current' });
    expect(entered().task).toEqual({ run: 'check', pin: '112233' });
  });

  it('goes on to a new PIN when the current one is right', () => {
    const state = run(entered(), { type: 'checked', check: { result: 'correct' } });
    expect(state).toMatchObject({ stage: { name: 'choose' }, digits: '', task: null });

    const saving = run(state, ...type('445566'), ...type('445566'));
    expect(saving.task).toEqual({ run: 'save', pin: '445566' });
  });

  it('shakes on a wrong current PIN and stays put', () => {
    const state = run(entered(), {
      type: 'checked',
      check: { result: 'wrong', lockedUntil: null },
    });
    expect(state).toMatchObject({
      stage: { name: 'current' },
      digits: '',
      note: { kind: 'wrong' },
      shakes: 1,
    });
  });

  it('shows the wait once too many were wrong', () => {
    const wrong = run(entered(), {
      type: 'checked',
      check: { result: 'wrong', lockedUntil: 5000 },
    });
    expect(wrong.note).toEqual({ kind: 'wait', until: 5000 });

    const waiting = run(startPinFlow('change'), ...type('112233'), {
      type: 'checked',
      check: { result: 'waiting', lockedUntil: 9000 },
    });
    expect(waiting).toMatchObject({ note: { kind: 'wait', until: 9000 }, shakes: 0 });
  });
});

describe('turning a PIN off', () => {
  it('removes it once the current PIN is right', () => {
    const state = run(startPinFlow('off'), ...type('112233'), {
      type: 'checked',
      check: { result: 'correct' },
    });
    expect(state.task).toEqual({ run: 'remove' });
    expect(run(state, { type: 'finished' }).stage).toEqual({ name: 'done' });
  });
});
