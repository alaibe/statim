import { useRef, useState } from 'react';
import { Pressable as RNPressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { cn, Icon, Text, useThemeColors } from '@/design';
import { MessageActions, type MessageAction, type MessageAnchor } from './message-actions';
import { ReactionRow, type Reactors } from './reaction-row';

export interface ReplyPreview {
  author: string;
  preview: string;
}

export interface ThreadChip {
  replies: number;
  onOpen(): void;
}

export function BubbleShell({
  fromMe,
  grouped,
  tail = false,
  senderName,
  showSender,
  bare = false,
  privateToMe = false,
  reactions,
  reactors,
  onReact,
  actions,
  replyPreview,
  thread,
  children,
}: {
  fromMe: boolean;
  grouped: boolean;
  /** The last bubble of a run from one sender, which points at them. */
  tail?: boolean;
  senderName: string;
  showSender: boolean;
  bare?: boolean;
  privateToMe?: boolean;
  reactions?: Readonly<Record<string, readonly string[]>>;
  reactors?: Reactors;
  onReact?: (emoji: string) => void;
  actions: () => MessageAction[];
  replyPreview?: ReplyPreview;
  thread?: ThreadChip;
  children: React.ReactNode;
}) {
  const [picking, setPicking] = useState(false);
  const [anchor, setAnchor] = useState<MessageAnchor | null>(null);
  const [menu, setMenu] = useState<MessageAction[]>([]);
  const bubbleRef = useRef<View>(null);

  const open = () => {
    const shown = actions();
    if (shown.length === 0) return;
    setMenu(shown);
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setPicking(true);
    });
  };

  const reacted = reactions && Object.keys(reactions).length > 0 ? reactions : undefined;
  const pointed = tail && !bare;

  const body = (held: boolean) => (
    <RNPressable
      ref={held ? undefined : bubbleRef}
      onLongPress={held ? undefined : open}
      // The desktop counterpart of the long-press. Spelled out rather than
      // through `contextMenu()`: react-hooks/refs treats passing `open` to a
      // call made during render as a ref read during render.
      {...(process.env.EXPO_OS === 'web' && !held
        ? {
            onContextMenu: (event: { preventDefault(): void }) => {
              event.preventDefault();
              open();
            },
          }
        : undefined)}
      delayLongPress={280}
      accessible={false}
      className={cn(
        // A wide window would otherwise stretch a bubble across the pane.
        !held && (process.env.EXPO_OS === 'web' ? 'max-w-[min(82%,560px)]' : 'max-w-[82%]'),
        bare
          ? ''
          : cn(
              'rounded-bubble px-3.5 py-2 shadow-sm',
              fromMe ? 'bg-bubble-out' : 'bg-bubble-in',
              fromMe
                ? pointed
                  ? 'rounded-br-none'
                  : 'rounded-br-md'
                : pointed
                  ? 'rounded-bl-none'
                  : 'rounded-bl-md',
              grouped && (fromMe ? 'rounded-tr-md' : 'rounded-tl-md')
            )
      )}>
      {replyPreview ? (
        <View
          className={cn(
            'mb-1.5 flex-row gap-2 rounded-md px-2 py-1',
            fromMe ? 'bg-bubble-out-on/15' : 'bg-content/5'
          )}>
          <View className={cn('w-0.5 rounded-full', fromMe ? 'bg-bubble-out-on' : 'bg-brand')} />
          <View className="min-w-0 flex-1">
            {replyPreview.author ? (
              <Text
                variant="micro"
                className={cn('font-semibold', fromMe ? 'text-bubble-out-on' : 'text-brand')}>
                {replyPreview.author}
              </Text>
            ) : null}
            <Text
              variant="caption"
              numberOfLines={1}
              className={fromMe ? 'text-bubble-out-on/80' : undefined}>
              {replyPreview.preview}
            </Text>
          </View>
        </View>
      ) : null}
      {children}
      {reacted && !bare ? (
        <ReactionRow
          reactions={reacted}
          fromMe={fromMe}
          inBubble
          reactors={reactors}
          onReact={onReact}
        />
      ) : null}
      {pointed ? <Tail fromMe={fromMe} /> : null}
    </RNPressable>
  );

  return (
    <>
      <View
        className={cn(
          'px-gutter',
          grouped ? 'pt-0.5' : 'pt-2',
          fromMe ? 'items-end' : 'items-start'
        )}>
        {showSender && !fromMe ? (
          <Text variant="micro" className="mb-0.5 ml-3 font-medium">
            {senderName}
          </Text>
        ) : null}

        {body(false)}

        {privateToMe ? (
          <View className="mt-1 flex-row items-center gap-1">
            <Icon name="eye-off-outline" size={11} tone="subtle" />
            <Text variant="micro">Only you can see this</Text>
          </View>
        ) : null}

        {reacted && bare ? (
          <ReactionRow
            reactions={reacted}
            fromMe={fromMe}
            inBubble={false}
            reactors={reactors}
            onReact={onReact}
          />
        ) : null}

        {thread ? (
          <RNPressable
            accessibilityRole="button"
            accessibilityLabel={`Open thread, ${repliesLabel(thread.replies)}`}
            onPress={thread.onOpen}
            className="mt-1 flex-row items-center gap-1 rounded-pill bg-surface-sunken px-2.5 py-1">
            <Icon name="chatbubbles-outline" size={13} tone="brand" />
            <Text variant="caption" className="font-semibold text-brand">
              {repliesLabel(thread.replies)}
            </Text>
            <Icon name="chevron-forward" size={12} tone="brand" />
          </RNPressable>
        ) : null}
      </View>

      <MessageActions
        visible={picking}
        anchor={anchor}
        fromMe={fromMe}
        actions={menu}
        onReact={onReact}
        onClose={() => setPicking(false)}
        render={() => body(true)}
      />
    </>
  );
}

function repliesLabel(count: number): string {
  return count === 1 ? '1 reply' : `${count} replies`;
}

/** Telegram's hook at the bubble's bottom corner, on the sender's side. */
function Tail({ fromMe }: { fromMe: boolean }) {
  const colors = useThemeColors();
  return (
    <Svg
      width={8}
      height={14}
      viewBox="0 0 8 14"
      style={{ position: 'absolute', bottom: 0, [fromMe ? 'right' : 'left']: -7 }}>
      <Path
        d={fromMe ? 'M0 0V14H8C4.5 13.5 1 11 0 6Z' : 'M8 0V14H0C3.5 13.5 7 11 8 6Z'}
        fill={fromMe ? colors['bubble-out'] : colors['bubble-in']}
      />
    </Svg>
  );
}
