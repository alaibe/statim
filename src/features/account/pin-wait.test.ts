import { describeWait } from './pin-wait';

it('counts a wait down in minutes and seconds, rounding up', () => {
  expect(describeWait(30_000)).toBe('0:30');
  expect(describeWait(29_001)).toBe('0:30');
  expect(describeWait(125_000)).toBe('2:05');
});

it('shows hours for the longest waits', () => {
  expect(describeWait(24 * 60 * 60_000)).toBe('24:00:00');
  expect(describeWait(3_723_000)).toBe('1:02:03');
});
