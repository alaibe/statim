import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { ListItem, type ListItemProps } from './list-item';

jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

let tree: ReactTestRenderer;

function render(props: ListItemProps) {
  act(() => {
    tree = create(createElement(ListItem, props));
  });
  return row();
}

const row = () => tree.root.findAll((node) => node.props.accessibilityRole === 'button')[0];

afterEach(() => {
  act(() => tree.unmount());
});

describe('a tappable row', () => {
  it('announces its title and subtitle', () => {
    const element = render({ title: 'Recovery phrase', subtitle: 'View the words', onPress() {} });
    expect(element.props.accessibilityLabel).toBe('Recovery phrase, View the words');
  });

  it('announces just the title when there is no subtitle', () => {
    expect(render({ title: 'Accounts', onPress() {} }).props.accessibilityLabel).toBe('Accounts');
  });

  it('lets a caller say it better', () => {
    const element = render({
      title: 'Base',
      subtitle: '0.4 ETH',
      accessibilityLabel: 'Base, 0.4 ether',
      onPress() {},
    });
    expect(element.props.accessibilityLabel).toBe('Base, 0.4 ether');
  });

  it('says nothing rather than guessing when the title is a node', () => {
    const element = render({ title: null, subtitle: 'Two people', onPress() {} });
    expect(element.props.accessibilityLabel).toBeUndefined();
  });

  it('is busy, and takes no second tap, until the promise it was handed settles', async () => {
    let finish = () => {};
    const onPress = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    render({ title: 'Switch account', onPress });

    act(() => {
      row().props.onPress();
    });
    act(() => {
      row().props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(row().props.accessibilityState).toEqual({ busy: true });

    await act(async () => finish());

    expect(row().props.accessibilityState).toEqual({ busy: false });
  });
});
