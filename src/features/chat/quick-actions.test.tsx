import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { asChatId } from '@/core/messaging/testing/ids';
import { QuickActions } from './quick-actions';

const mockAction = {
  id: 'ai-summarize',
  label: 'Summarize',
  icon: 'document-text-outline',
  command: '/summarize',
};
const mockActions = [{ action: mockAction }];
jest.mock('@/core/plugins/host', () => ({
  usePluginHost: () => ({
    registry: {
      subscribe: () => () => {},
      composerActionsFor: () => mockActions,
      commandsFor: () => new Map(),
    },
  }),
}));
jest.mock('./use-chat-permissions', () => ({ useChatSession: () => undefined }));
jest.mock('@/design', () => ({
  cn: (...classes: string[]) => classes.join(' '),
  Enter: { fade: () => undefined },
  Exit: { fade: () => undefined },
  Icon: 'Icon',
  Pressable: 'Pressable',
  Text: 'Text',
}));

it('labels the suggested chip and waits for a tap to run it', () => {
  const onRun = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      createElement(QuickActions, {
        chatId: asChatId('xmtp-chat'),
        scope: 'dm',
        hasDraft: false,
        suggestedId: 'ai-summarize',
        onRun,
      })
    );
  });
  const chip = tree.root.findByProps({ testID: 'quick-ai-summarize' });
  expect(chip.props.accessibilityLabel).toBe('Summarize, suggested by Jev');
  expect(onRun).not.toHaveBeenCalled();
  act(() => {
    chip.props.onPress();
  });
  expect(onRun).toHaveBeenCalledWith(mockAction);
  act(() => tree.unmount());
});
