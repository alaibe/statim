import { act, createElement } from 'react';
import { create } from 'react-test-renderer';

import { useLoadUntil } from './use-sticker-packs';

afterEach(() => jest.useRealTimers());

describe('useLoadUntil', () => {
  it('loads again while pictures are missing, and stops once they are all there', async () => {
    jest.useFakeTimers();
    let calls = 0;
    const load = jest.fn(async () => (++calls < 3 ? ['a', ''] : ['a', 'b']));
    let seen: string[] | undefined;
    function Probe() {
      seen = useLoadUntil('pack', load, (value) => value.every(Boolean)).value;
      return null;
    }

    await act(async () => {
      create(createElement(Probe));
    });
    expect(seen).toEqual(['a', '']);
    for (let tick = 0; tick < 2; tick++) {
      await act(async () => {
        jest.advanceTimersByTime(700);
      });
    }
    expect(seen).toEqual(['a', 'b']);
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(load).toHaveBeenCalledTimes(3);
  });
});
