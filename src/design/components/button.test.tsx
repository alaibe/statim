import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { reportError } from '@/core/app/report-error';
import { Button, type ButtonProps } from './button';

jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('@/core/app/report-error', () => ({ reportError: jest.fn() }));

/**
 * `Button` takes `onPress`, `disabled` and `haptic` out of its props and
 * spreads what is left onto the Pressable, so anything it destructures and
 * forgets to hand over is dropped silently: the button renders, springs on
 * touch and does nothing.
 */
let tree: ReactTestRenderer;

function render(props: ButtonProps) {
  act(() => {
    tree = create(createElement(Button, props));
  });
  return pressable();
}

const pressable = () => tree.root.findAll((node) => node.props.accessibilityRole === 'button')[0];

afterEach(() => {
  act(() => tree.unmount());
  jest.mocked(reportError).mockClear();
});

describe('Button', () => {
  it('passes onPress through to the pressable', () => {
    const onPress = jest.fn();
    const element = render({ label: 'Save', onPress });

    act(() => {
      element.props.onPress({});
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const onPress = jest.fn();
    const element = render({ label: 'Save', onPress, disabled: true });

    expect(element.props.onPress).toBeUndefined();
    expect(element.props.disabled).toBe(true);
  });

  it('does not fire while loading', () => {
    // A second tap on a button that is already working is the classic way to
    // send the same thing twice.
    const onPress = jest.fn();
    const element = render({ label: 'Save', onPress, loading: true });

    expect(element.props.onPress).toBeUndefined();
    expect(element.props.disabled).toBe(true);
  });

  it('announces itself as a button, with its state', () => {
    const element = render({ label: 'Save', loading: true });

    expect(element.props.accessibilityRole).toBe('button');
    expect(element.props.accessibilityState).toEqual({ disabled: true, busy: true });
  });

  it('gives the compact size a 44pt touch target', () => {
    // The small button draws below the minimum, so the slop is the only thing
    // making it reachable.
    expect(render({ label: 'x', size: 'sm' }).props.hitSlop).toBeDefined();
    expect(render({ label: 'x', size: 'md' }).props.hitSlop).toBeUndefined();
  });

  it('loads until the promise it was handed settles, taking one press meanwhile', async () => {
    let finish = () => {};
    const onPress = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const press = render({ label: 'Save', onPress }).props.onPress;

    act(() => {
      press({});
      press({});
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(pressable().props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(pressable().props.onPress).toBeUndefined();

    await act(async () => finish());

    expect(pressable().props.accessibilityState).toEqual({ disabled: false, busy: false });
  });

  it('reports a handler that rejects, and can be pressed again', async () => {
    const error = new Error('offline');
    const element = render({ label: 'Save', onPress: () => Promise.reject(error) });

    await act(async () => element.props.onPress({}));

    expect(reportError).toHaveBeenCalledWith(error);
    expect(pressable().props.disabled).toBe(false);
  });
});
