import { createContext, useRef, useState } from "react";
import { Pressable as RNPressable, View } from "react-native";

import { cn, desktop, Icon, Pressable, Radius, Text, useThemeColors, withAlpha } from "@/design";
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

  const colors = useThemeColors();
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
      className={bare ? undefined : "px-2.5 py-1.5"}
      style={[
        held ? null : { maxWidth: desktop ? 560 : "82%" },
        bare
          ? null
          : {
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: colors[side.border],
              backgroundColor: colors[side.fill],
            },
      ]}
    >
      {replyPreview ? <ReplyQuote reply={replyPreview} side={side} /> : null}
      {children}
    </RNPressable>
  );

  return (
    <>
      <View className={cn("px-4", grouped ? "pt-0.5" : "pt-2", side.align)}>
        {showSender && !fromMe ? (
          <Text variant="label" className="mb-0.5 ml-1">
            {senderName}
          </Text>
        ) : null}

        {body(false)}

        {privateToMe ? (
          <View className="mt-1 flex-row items-center gap-1">
            <Icon name="eye-off" size={16} tone="muted" />
            <Text variant="meta">Only you can see this</Text>
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

/** In: `panel` with a 1px `line`. Out: `accent-soft`. Radius `md`, no tail, no shadow. */
const SIDE = {
  out: { fill: "accent-soft", border: "accent-soft", align: "items-end", bar: "fg", author: "fg" },
  in: { fill: "panel", border: "line", align: "items-start", bar: "accent", author: "accent" },
} as const;

type Side = (typeof SIDE)["out" | "in"];

function ReplyQuote({ reply, side }: { reply: ReplyPreview; side: Side }) {
  const colors = useThemeColors();
  return (
    <View
      className="mb-1.5 flex-row gap-2 px-2 py-1"
      style={{ borderRadius: Radius.sm, backgroundColor: withAlpha(colors.fg, 0.06) }}
    >
      <View style={{ width: 2, backgroundColor: colors[side.bar] }} />
      <View className="min-w-0 flex-1">
        {reply.author ? (
          <Text variant="label" tone={side.author}>
            {reply.author}
          </Text>
        ) : null}
        <Text size="sm" tone="muted" numberOfLines={1}>
          {reply.preview}
        </Text>
      </View>
    </View>
  );
}

function ThreadButton({ thread }: { thread: ThreadChip }) {
  const colors = useThemeColors();
  const label = repliesLabel(thread.replies, thread.newReplies);
  const unread = thread.newReplies > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open thread, ${label}`}
      onPress={thread.onOpen}
      className="mt-1 flex-row items-center gap-1.5 px-2 py-1"
      style={({ hovered }) => ({
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: colors["line-strong"],
        backgroundColor: hovered ? colors.hover : colors.panel,
      })}
    >
      <Icon name="messages-square" size={16} tone={unread ? "accent" : "muted"} />
      <Text variant="control" tone={unread ? "accent" : "fg"}>
        {label}
      </Text>
      <Icon name="chevron-right" size={16} tone="muted" />
    </Pressable>
  );
}

export function repliesLabel(count: number, fresh = 0): string {
  const replies = count === 1 ? "1 reply" : `${count} replies`;
  return fresh > 0 ? `${replies} · ${fresh} new` : replies;
}
