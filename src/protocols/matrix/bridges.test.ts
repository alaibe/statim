import { BRIDGED_NETWORKS } from '@/core/messaging/networks';

import { isBridgeBot, KNOWN_BRIDGES } from './bridges';

it('has one bridge for each bridged network', () => {
  expect(KNOWN_BRIDGES.map((bridge) => bridge.network).sort()).toEqual(
    Object.keys(BRIDGED_NETWORKS).sort()
  );
});

it('recognizes bridge infrastructure without classifying every bot or bridged participant as infrastructure', () => {
  expect(isBridgeBot('@slackbot:example.org')).toBe(true);
  expect(isBridgeBot('@slack_t123-uslackbot:example.org')).toBe(true);
  expect(isBridgeBot('@slack_t123-u456:example.org')).toBe(false);
  expect(isBridgeBot('@helpfulbot:example.org')).toBe(false);
});
