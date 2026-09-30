import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import type { LiveView, WidgetContent } from '@/core/messaging/types';
import { notifyLiveViews } from '@/core/plugins/live';
import type { PluginView } from '@/core/plugins/types';
import type { Widget } from '@/design/widgets';

import { useLiveWidget, usePluginView } from './use-live-widget';

const mockViews = new Map<string, PluginView>();
const mockHost = {
  enabledIds: ['p'],
  registry: { view: (pluginId: string, name: string) => mockViews.get(`${pluginId}/${name}`) },
};
jest.mock('@/core/plugins/host', () => ({ usePluginHost: () => mockHost }));

const text = (value: string): Widget => ({ kind: 'text', text: value });
const card = (value: string) => ({ kind: 'widget' as const, widget: text(value), fallback: value });
const snapshot: WidgetContent = {
  ...card('then'),
  live: { pluginId: 'p', view: 'list', args: ['x'] },
};

function Probe({ content }: { content: WidgetContent }) {
  return createElement('probe', { widget: useLiveWidget(content) });
}

let tree: ReactTestRenderer;
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const settle = () => act(nextTask);
const mount = (content: WidgetContent) =>
  act(async () => {
    tree = create(createElement(Probe, { content }));
    await nextTask();
  });
const shown = () => tree.root.findByType('probe' as never).props.widget as Widget;

afterEach(async () => {
  await act(() => tree?.unmount());
  mockViews.clear();
});

describe('useLiveWidget', () => {
  it('rebuilds a card from its view, and again when its plugin changes', async () => {
    let state = 'now';
    const view = jest.fn(async (args: readonly string[] = []) => card(`${state} for ${args[0]}`));
    mockViews.set('p/list', view);

    await mount(snapshot);
    expect(shown()).toEqual(text('now for x'));

    state = 'later';
    notifyLiveViews('p');
    await settle();
    expect(shown()).toEqual(text('later for x'));
    expect(view).toHaveBeenCalledTimes(2);
  });

  it('keeps the snapshot while the plugin has no such view', async () => {
    await mount(snapshot);
    expect(shown()).toEqual(text('then'));
  });

  it('keeps what it has when the view fails', async () => {
    mockViews.set('p/list', async () => {
      throw new Error('gone');
    });
    await mount(snapshot);
    expect(shown()).toEqual(text('then'));
  });

  it('ignores a change to another plugin', async () => {
    const view = jest.fn(async () => card('now'));
    mockViews.set('p/list', view);

    await mount(snapshot);
    notifyLiveViews('q');
    await settle();
    expect(view).toHaveBeenCalledTimes(1);
  });
});

describe('usePluginView', () => {
  const live: LiveView = { pluginId: 'p', view: 'list', args: ['x'] };

  function ViewProbe({ at, once }: { at: LiveView; once?: boolean }) {
    return createElement('probe', { widget: usePluginView(at, { once }) });
  }
  const mountView = (at: LiveView, once?: boolean) =>
    act(async () => {
      tree = create(createElement(ViewProbe, { at, once }));
      await nextTask();
    });

  it('builds a view that costs network requests only once when asked', async () => {
    const view = jest.fn(async () => card('now'));
    mockViews.set('p/list', view);

    await mountView(live, true);
    notifyLiveViews('p');
    await settle();
    expect(shown()).toEqual(text('now'));
    expect(view).toHaveBeenCalledTimes(1);
  });

  it('keeps one build across renders that pass an equal view', async () => {
    const view = jest.fn(async () => card('now'));
    mockViews.set('p/list', view);

    await mountView({ ...live });
    await act(async () => {
      tree.update(createElement(ViewProbe, { at: { ...live } }));
      await nextTask();
    });
    expect(shown()).toEqual(text('now'));
    expect(view).toHaveBeenCalledTimes(1);
  });
});
