import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearScope, scopePrefix } from './scope';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('clearScope', () => {
  it('removes one account without touching another', async () => {
    await AsyncStorage.multiSet([
      [scopePrefix('a') + 'chat.readAt', '{"a":1}'],
      [scopePrefix('b') + 'chat.readAt', '{"b":1}'],
    ]);

    await clearScope('a');

    expect(await AsyncStorage.getItem(scopePrefix('a') + 'chat.readAt')).toBeNull();
    expect(await AsyncStorage.getItem(scopePrefix('b') + 'chat.readAt')).toBe('{"b":1}');
  });
});
