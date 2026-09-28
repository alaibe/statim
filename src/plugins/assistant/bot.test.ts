import AsyncStorage from '@react-native-async-storage/async-storage';

import { useChatStore } from '@/core/messaging/chat-store';
import { projectTestAccount, resetChatStore } from '@/core/messaging/testing/store';
import { deleteAccountDatabase } from '@/storage/database';
import { lockCard, makeStatusBot, thisDevice } from './bot';
import { STATUS_LOCAL_ID } from '@/core/messaging/bots';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetChatStore();
  await deleteAccountDatabase('status-test');
  projectTestAccount('status-test');
});

it('keeps ordinary notes quiet and pages Statim history from account SQLite', async () => {
  const bot = makeStatusBot();
  await useChatStore.getState().registerBots([bot]);
  const welcomeLength = useChatStore.getState().messages[STATUS_LOCAL_ID].length;

  for (let index = 0; index < 205; index++) {
    await useChatStore.getState().sendMessage(STATUS_LOCAL_ID, {
      kind: 'text',
      text: `Remember how to help with item ${index}`,
    });
  }
  expect(useChatStore.getState().messages[STATUS_LOCAL_ID]).toHaveLength(welcomeLength + 205);

  resetChatStore();
  projectTestAccount('status-test');
  await useChatStore.getState().registerBots([makeStatusBot()]);
  const restored = useChatStore.getState().messages[STATUS_LOCAL_ID];
  expect(restored).toHaveLength(welcomeLength + 205);
  expect(restored[welcomeLength].content).toEqual({
    kind: 'text',
    text: 'Remember how to help with item 0',
  });
  expect(restored.at(-1)?.content).toEqual({
    kind: 'text',
    text: 'Remember how to help with item 204',
  });
  await deleteAccountDatabase('status-test');
});

describe('the lock card in the greeting', () => {
  const actionsOf = (device: Parameters<typeof lockCard>[0]) => {
    const { widget } = lockCard(device);
    if (widget.kind !== 'card') throw new Error('expected a card');
    return widget.children.flatMap((child) => (child.kind === 'actions' ? child.actions : []));
  };

  it('names the biometrics each platform has', () => {
    expect(thisDevice('ios')).toEqual({ kind: 'phone', biometrics: 'Face ID or Touch ID' });
    expect(thisDevice('android')).toEqual({
      kind: 'phone',
      biometrics: 'fingerprint or face unlock',
    });
  });

  it('offers a PIN and the biometric lock on a phone', () => {
    expect(actionsOf(thisDevice('ios'))).toEqual([
      { label: 'Set a PIN', command: '/security pin' },
      { label: 'Turn on Face ID or Touch ID', command: '/security', tone: 'neutral' },
    ]);
  });

  it('offers Touch ID on a Mac, and only a PIN on another computer', () => {
    expect(actionsOf({ kind: 'computer', biometrics: 'Touch ID' }).map((a) => a.label)).toEqual([
      'Set a PIN',
      'Turn on Touch ID',
    ]);
    expect(actionsOf({ kind: 'computer', biometrics: null })).toEqual([
      { label: 'Set a PIN', command: '/security pin' },
    ]);
  });

  it('is part of the Statim greeting', () => {
    expect(makeStatusBot().greeting()).toContainEqual(lockCard());
  });
});
