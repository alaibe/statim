import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { type ReactElement, type Ref, useImperativeHandle, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import type { ChatMessage, MessageId } from '@/core/messaging/types';

export interface MessageListHandle {
  scrollToEnd(): void;
  scrollToMessage(id: MessageId): void;
}

export interface MessageListProps {
  ref?: Ref<MessageListHandle>;
  messages: ChatMessage[];
  renderMessage(message: ChatMessage, index: number): ReactElement;
  header: ReactElement;
  footer: ReactElement | null;
  /** Room above the first message for the header floating over the list. */
  topInset: number;
  onStartReached(): void;
}

const FOLLOW_SLACK_PX = 80;

export function MessageList({
  ref,
  messages,
  renderMessage,
  header,
  footer,
  topInset,
  onStartReached,
}: MessageListProps) {
  const list = useRef<FlashListRef<ChatMessage>>(null);
  const following = useRef(true);
  const lastOffset = useRef(0);
  useImperativeHandle(ref, () => ({
    scrollToEnd() {
      following.current = true;
      list.current?.scrollToEnd({ animated: true });
    },
    scrollToMessage(id) {
      const index = messages.findIndex((message) => message.id === id);
      if (index < 0) return;
      following.current = false;
      void list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    },
  }));

  // A wheel or trackpad never begins a drag, so the scroll direction decides whether to follow.
  const trackScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    if (contentSize.height - contentOffset.y - layoutMeasurement.height < FOLLOW_SLACK_PX)
      following.current = true;
    else if (contentOffset.y < lastOffset.current) following.current = false;
    lastOffset.current = contentOffset.y;
  };
  const followIfNeeded = () => {
    if (following.current) list.current?.scrollToEnd({ animated: false });
  };

  return (
    <FlashList
      ref={list}
      data={messages}
      onScroll={trackScroll}
      scrollEventThrottle={32}
      onContentSizeChange={followIfNeeded}
      onStartReached={onStartReached}
      onStartReachedThreshold={0.5}
      keyExtractor={(message) => message.id}
      getItemType={(message) => message.content.kind}
      maintainVisibleContentPosition={{
        startRenderingFromBottom: true,
        autoscrollToBottomThreshold: 0.2,
      }}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: 8 }}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      renderItem={({ item, index }) => renderMessage(item, index)}
    />
  );
}
