import { type RefObject, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';

import type { MessageListProps } from './message-list';

export type { MessageListHandle, MessageListProps } from './message-list';

const PAGE = 60;
const NEAR_TOP_PX = 1200;
const FOLLOW_SLACK_PX = 80;

const rowId = (id: string) => `message-${id}`;

export function MessageList({
  ref,
  messages,
  renderMessage,
  header,
  footer,
  topInset,
  onStartReached,
}: MessageListProps) {
  const scroller = useRef<ScrollView>(null);
  const node = () => scroller.current?.getScrollableNode() as HTMLElement | undefined;
  const row = (id: string) => node()?.querySelector<HTMLElement>(`#${CSS.escape(rowId(id))}`);
  const indexOf = (id: string | undefined) => messages.findIndex((message) => message.id === id);

  const newestPage = Math.max(0, messages.length - PAGE);
  const [oldestShown, setOldestShown] = useState(() => messages[newestPage]?.id);
  const found = indexOf(oldestShown);
  const start = found < 0 ? newestPage : found;
  const showFrom = (index: number) => setOldestShown(messages[Math.max(0, index)]?.id);

  const reveal = (id: string) => row(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const revealDrawn = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (revealDrawn.current) reveal(revealDrawn.current);
    revealDrawn.current = null;
  });
  useImperativeHandle(ref, () => ({
    scrollToEnd() {
      node()?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    scrollToMessage(id) {
      const index = indexOf(id);
      if (index < 0) return;
      if (index >= start) return reveal(id);
      revealDrawn.current = id;
      showFrom(index - PAGE / 2);
    },
  }));

  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    if (contentSize.height - layoutMeasurement.height + contentOffset.y > NEAR_TOP_PX) return;
    if (start > 0) showFrom(start - PAGE);
    else onStartReached();
  };

  useHoldReadingPlace(scroller);

  return (
    <ScrollView
      ref={scroller}
      style={{ flexDirection: 'column-reverse', overflowAnchor: 'none' } as object}
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: 8 }}
      onScroll={onScroll}
      scrollEventThrottle={50}>
      {start === 0 ? header : null}
      {messages.slice(start).map((message, index) => (
        <View key={message.id} nativeID={rowId(message.id)}>
          {renderMessage(message, start + index)}
        </View>
      ))}
      {footer}
    </ScrollView>
  );
}

function useHoldReadingPlace(scroller: RefObject<ScrollView | null>) {
  useLayoutEffect(() => {
    const view = scroller.current?.getScrollableNode() as HTMLElement | undefined;
    const content = view?.firstElementChild;
    if (!view || !content) return;
    const heights = new WeakMap<Element, number>();
    const resized = new ResizeObserver((entries) => {
      const top = view.getBoundingClientRect().top;
      let grown = 0;
      for (const { target, borderBoxSize } of entries) {
        const height = borderBoxSize[0].blockSize;
        if (target.isConnected && target.getBoundingClientRect().top >= top) {
          grown += height - (heights.get(target) ?? 0);
        }
        heights.set(target, height);
      }
      if (grown && view.scrollTop < -FOLLOW_SLACK_PX) view.scrollTop -= grown;
    });
    const watch = (nodes: Iterable<Node>) => {
      for (const added of nodes) if (added instanceof Element) resized.observe(added);
    };
    watch(content.children);
    const mounted = new MutationObserver((records) => {
      for (const record of records) watch(record.addedNodes);
    });
    mounted.observe(content, { childList: true });
    return () => {
      resized.disconnect();
      mounted.disconnect();
    };
  }, [scroller]);
}
