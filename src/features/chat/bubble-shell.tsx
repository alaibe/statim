import { createContext, useRef, useState } from "react";
import { Pressable as RNPressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { cn, Icon, Text, useThemeColors } from "@/design";
import { type MessageAction, MessageActions, type MessageAnchor } from "./message-actions";

export interface ReplyPreview {
  author: string;
  preview: string;
}

export interface ThreadChip {
  replies: number;
  newReplies: number;
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
  tail: boolean;
  senderName: string;
  showSender: boolean;
  bare?: boolean;
  privateToMe?: boolean;
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
  const side = SIDE[fromMe ? "out" : "in"];

  const body = (held: boolean) => (
    <RNPressable
      ref={held ? undefined : bubbleRef}
      onLongPress={held ? undefined : open}
      onStartShouldSetResponderCapture={held ? () => true : undefined}
      // Spelled out, not `contextMenu()`: react-hooks/refs reads passing `open` to a call during render as a ref read.
      {...(process.env.EXPO_OS === "web" && !held
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
      className={bubbleClass({ held, bare, side, pointed, grouped })}
    >
      {replyPreview ? <ReplyQuote reply={replyPreview} side={side} /> : null}
      {children}
      {pointed ? <Tail side={side} /> : null}
    </RNPressable>
  );

  return (
    <>
      <View className={cn("px-4", grouped ? "pt-0.5" : "pt-2", side.align)}>
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

        {thread ? <ThreadButton thread={thread} /> : null}
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

const TAIL = {
  in: "M3 19H9V2C8.807 4.84 8.124 7.767 6.95 10.782C6.046 13.107 4.504 15.267 2.325 17.262A1 1 0 0 0 3 19Z",
  out: "M8 19H2V2C2.193 4.84 2.876 7.767 4.05 10.782C4.954 13.107 6.496 15.267 8.675 17.262A1 1 0 0 1 8 19Z",
};

const SIDE = {
  out: {
    fill: "bg-accent-soft",
    color: "accent-soft",
    align: "items-end",
    edge: "right",
    tail: TAIL.out,
    pointed: "rounded-br-none",
    corner: "rounded-br-md",
    grouped: "rounded-tr-md",
    quote: "bg-fg/15",
    bar: "bg-fg",
    author: "text-fg",
    preview: "text-fg/80",
  },
  in: {
    fill: "bg-panel",
    color: "panel",
    align: "items-start",
    edge: "left",
    tail: TAIL.in,
    pointed: "rounded-bl-none",
    corner: "rounded-bl-md",
    grouped: "rounded-tl-md",
    quote: "bg-fg/5",
    bar: "bg-accent",
    author: "text-accent",
    preview: undefined,
  },
} as const;

type Side = (typeof SIDE)["out" | "in"];

function bubbleClass({
  held,
  bare,
  side,
  pointed,
  grouped,
}: {
  held: boolean;
  bare: boolean;
  side: Side;
  pointed: boolean;
  grouped: boolean;
}): string {
  return cn(
    !held && (process.env.EXPO_OS === "web" ? "max-w-[min(82%,560px)]" : "max-w-[82%]"),
    !bare && cn("rounded-lg px-2.5 py-1.5", side.fill, pointed ? side.pointed : side.corner, grouped && side.grouped),
  );
}

function ReplyQuote({ reply, side }: { reply: ReplyPreview; side: Side }) {
  return (
    <View className={cn("mb-1.5 flex-row gap-2 rounded-md px-2 py-1", side.quote)}>
      <View className={cn("w-0.5 rounded-full", side.bar)} />
      <View className="min-w-0 flex-1">
        {reply.author ? (
          <Text variant="micro" className={cn("font-semibold", side.author)}>
            {reply.author}
          </Text>
        ) : null}
        <Text variant="caption" numberOfLines={1} className={side.preview}>
          {reply.preview}
        </Text>
      </View>
    </View>
  );
}

function ThreadButton({ thread }: { thread: ThreadChip }) {
  const label = repliesLabel(thread.replies, thread.newReplies);
  const unread = thread.newReplies > 0;
  return (
    <RNPressable
      accessibilityRole="button"
      accessibilityLabel={`Open thread, ${label}`}
      onPress={thread.onOpen}
      className={cn("mt-1 flex-row items-center gap-1.5 rounded-full px-2.5 py-1", unread ? "bg-accent" : "bg-side")}
    >
      <Icon name="chatbubbles-outline" size={13} tone={unread ? "on-accent" : "accent"} />
      <Text variant="caption" className={cn("font-semibold", unread ? "text-on-accent" : "text-accent")}>
        {label}
      </Text>
      <Icon name="chevron-forward" size={12} tone={unread ? "on-accent" : "accent"} />
    </RNPressable>
  );
}

export function repliesLabel(count: number, fresh = 0): string {
  const replies = count === 1 ? "1 reply" : `${count} replies`;
  return fresh > 0 ? `${replies} · ${fresh} new` : replies;
}

const BUBBLE_SHADOW = { boxShadow: "0 1px 2px rgba(16, 35, 47, 0.15)" };

function Tail({ side }: { side: Side }) {
  const colors = useThemeColors();
  return (
    <Svg width={11} height={20} viewBox="0 0 11 20" style={{ position: "absolute", bottom: -1, [side.edge]: -8.4 }}>
      <Path d={side.tail} fill={colors[side.color]} />
    </Svg>
  );
}
