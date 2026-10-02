import { createContext, useRef, useState } from 'react';
import { Pressable as RNPressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { cn, Icon, Text, useThemeColors } from '@/design';
import { MessageActions, type MessageAction, type MessageAnchor } from './message-actions';

export interface ReplyPreview {
  author: string;
  preview: string;
}

export interface ThreadChip {
  replies: number;
  onOpen(): void;
}

export const HeldBubble = createContext(false);

export function BubbleShell({
  fromMe,
  grouped,
  tail,
  senderName,
  showSender,
  bare = false,
  privateToMe = false,
  below,
  onReact,
  actions,
  replyPreview,
  thread,
  children,
}: {
  fromMe: boolean;
  grouped: boolean;
  /** The last bubble of a run from one sender, which points at them. */
  tail: boolean;
  senderName: string;
  showSender: boolean;
  bare?: boolean;
  privateToMe?: boolean;
  /** Under the bubble, for content drawn without one. */
  below: React.ReactNode;
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

  const pointed = tail && !bare;

  const body = (held: boolean) => (
    <RNPressable
      ref={held ? undefined : bubbleRef}
      onLongPress={held ? undefined : open}
      onStartShouldSetResponderCapture={held ? () => true : undefined}
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
      style={bare ? undefined : BUBBLE_SHADOW}
      className={cn(
        // A wide window would otherwise stretch a bubble across the pane.
        !held && (process.env.EXPO_OS === 'web' ? 'max-w-[min(82%,560px)]' : 'max-w-[82%]'),
        bare
          ? ''
          : cn(
              'rounded-bubble px-2.5 py-1.5',
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

        {below}

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
        render={() => <HeldBubble value>{body(true)}</HeldBubble>}
      />
    </>
  );
}

function repliesLabel(count: number): string {
  return count === 1 ? '1 reply' : `${count} replies`;
}

const BUBBLE_SHADOW = { boxShadow: '0 1px 2px rgba(16, 35, 47, 0.15)' };

/** Telegram Web's tail (tweb `message-tail-filled`), drawn against the bubble's square corner. */
const TAIL = {
  in: 'M3 19H9V2C8.807 4.84 8.124 7.767 6.95 10.782C6.046 13.107 4.504 15.267 2.325 17.262A1 1 0 0 0 3 19Z',
  out: 'M8 19H2V2C2.193 4.84 2.876 7.767 4.05 10.782C4.954 13.107 6.496 15.267 8.675 17.262A1 1 0 0 1 8 19Z',
};

function Tail({ fromMe }: { fromMe: boolean }) {
  const colors = useThemeColors();
  return (
    <Svg
      width={11}
      height={20}
      viewBox="0 0 11 20"
      style={{ position: 'absolute', bottom: -1, [fromMe ? 'right' : 'left']: -8.4 }}>
      <Path
        d={fromMe ? TAIL.out : TAIL.in}
        fill={fromMe ? colors['bubble-out'] : colors['bubble-in']}
      />
    </Svg>
  );
}
