import { BRIDGED_NETWORKS } from '@/core/messaging/networks';

import { KNOWN_BRIDGES } from './bridges';

it('has one bridge for each bridged network', () => {
  expect(KNOWN_BRIDGES.map((bridge) => bridge.network).sort()).toEqual(
    Object.keys(BRIDGED_NETWORKS).sort()
  );
});
