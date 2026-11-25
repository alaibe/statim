import { router } from "expo-router";
import { Fragment, type ReactNode, use, useMemo, useState } from "react";
import { Text as RNText, TextInput, type TextStyle, View } from "react-native";
import { type LinkSegment, segmentText } from "@/core/messaging/links";
import { type Block, listMarker, parseMarkdown, type Span } from "@/core/messaging/markdown";
import type { ChatId, ParticipantId } from "@/core/messaging/types";
import { Menu, Radius, type ThemeColors, textStyle, useThemeColors, withAlpha } from "@/design";

import { HeldBubble } from "./bubble-shell";
import { linkActions, openLink } from "./link-actions";
import { useOffersSend } from "./use-offers-send";

/** A message is content: Inter at the body size in `fg`; code in mono; links and mentions in `accent`. */
interface Look {
  fromMe: boolean;
  colors: ThemeColors;
  onHold: (link: LinkSegment) => void;
  onMention?: (id: ParticipantId) => void;
}

const BODY = textStyle("body");
const STRONG = textStyle("body", { strong: true });
const CODE = textStyle("code");

export function MessageText({
  text,
  fromMe,
  chatId,
  onCommand,
  footer,
}: {
  text: string;
  fromMe: boolean;
  /** The time, at the end of a one-paragraph text; `label` is what it reads, to keep its room free. */
  footer?: { node: ReactNode; label: string };
  chatId?: ChatId;
  onCommand?: (command: string) => void;
}) {
  const colors = useThemeColors();
  const [held, setHeld] = useState<LinkSegment | null>(null);
  const lifted = use(HeldBubble);
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const canSend = useOffersSend(chatId, onCommand);
  const look: Look = {
    fromMe,
    colors,
    onHold: setHeld,
    onMention: chatId
      ? (member) => router.push({ pathname: "/profile/[id]", params: { id: chatId, member } })
      : undefined,
  };
  // The time's room at the end of the line is text, which a selection would take.
  const only = blocks.length === 1 && !lifted ? blocks[0] : undefined;

  return (
    <>
      {only?.kind === "paragraph" ? (
        <View>
          <RNText style={[BODY, { color: colors.fg }]}>
            <Spans spans={only.spans} look={look} />
            {footer ? (
              // A span ignores opacity, and Android reads transparent black as no colour.
              <RNText style={[textStyle("meta"), { color: withAlpha(colors.fg, 0) }]}>{`  ${footer.label}`}</RNText>
            ) : null}
          </RNText>
          {footer ? <View className="absolute bottom-0 right-0">{footer.node}</View> : null}
        </View>
      ) : (
        <>
          <View className="gap-1">
            <Blocks blocks={blocks} look={look} />
          </View>
          {footer ? <View className="flex-row justify-end">{footer.node}</View> : null}
        </>
      )}

      {held ? (
        <Menu
          visible
          onClose={() => setHeld(null)}
          title={held.text}
          items={linkActions(held, canSend ? onCommand : undefined)}
        />
      ) : null}
    </>
  );
}

function Blocks({ blocks, look }: { blocks: readonly Block[]; look: Look }) {
  const { colors } = look;
  const base = { ...BODY, color: colors.fg };
  return blocks.map((block, i) => {
    const gap = block.spaced ? { marginTop: 6 } : undefined;
    switch (block.kind) {
      case "paragraph":
      case "heading":
        return (
          <Paragraph key={i} style={[base, block.kind === "heading" ? STRONG : null, gap]}>
            <Spans spans={block.spans} look={look} />
          </Paragraph>
        );
      case "code":
        return (
          <View
            key={i}
            className="px-2.5 py-1.5"
            style={[{ borderRadius: Radius.sm, backgroundColor: withAlpha(colors.fg, 0.06) }, gap]}
          >
            <Paragraph selectable style={{ ...CODE, color: colors.fg }}>
              {block.text}
            </Paragraph>
          </View>
        );
      case "quote":
        return (
          <View key={i} className="flex-row gap-2" style={gap}>
            <View style={{ width: 2, backgroundColor: look.fromMe ? colors.muted : colors.accent }} />
            <View className="min-w-0 shrink grow gap-1">
              <Blocks blocks={block.blocks} look={look} />
            </View>
          </View>
        );
      case "list":
        return (
          <View key={i} className="gap-0.5" style={gap}>
            {block.items.map((item, n) => (
              <View key={n} className="flex-row gap-1.5">
                <RNText style={base}>{listMarker(block, n)}</RNText>
                <View className="min-w-0 shrink grow gap-1">
                  <Blocks blocks={item} look={look} />
                </View>
              </View>
            ))}
          </View>
        );
      case "rule":
        return <View key={i} style={[{ height: 1, marginVertical: 4, backgroundColor: colors.line }, gap]} />;
    }
  });
}

/** In a held bubble on iOS, a UITextView: a selectable Text there only copies the whole of itself. */
function Paragraph({
  style,
  selectable,
  children,
}: {
  style: React.ComponentProps<typeof RNText>["style"];
  selectable?: boolean;
  children: ReactNode;
}) {
  const lifted = use(HeldBubble);
  if (lifted && process.env.EXPO_OS === "ios") {
    return (
      <TextInput readOnly multiline scrollEnabled={false} style={[style, { padding: 0 }]}>
        <RNText style={style}>{children}</RNText>
      </TextInput>
    );
  }
  return (
    <RNText selectable={lifted || selectable} style={style}>
      {children}
    </RNText>
  );
}

function spanStyle(span: Span, look: Look): TextStyle | null {
  const style: TextStyle = {};
  if (span.style.bold) style.fontFamily = STRONG.fontFamily;
  if (span.style.italic) style.fontStyle = "italic";
  if (span.style.strike) style.textDecorationLine = "line-through";
  if (span.style.code) {
    style.fontFamily = CODE.fontFamily;
    style.fontSize = CODE.fontSize;
    style.backgroundColor = withAlpha(look.colors.fg, 0.08);
  }
  return Object.keys(style).length > 0 ? style : null;
}

function accentText(look: Look): TextStyle {
  return { fontFamily: STRONG.fontFamily, color: look.fromMe ? look.colors.fg : look.colors.accent };
}

function Spans({ spans, look }: { spans: readonly Span[]; look: Look }) {
  return spans.map((span, i) => {
    const style = spanStyle(span, look);
    const mentioned = span.mention;
    if (mentioned) {
      return (
        <RNText
          key={i}
          accessibilityRole={look.onMention ? "link" : undefined}
          suppressHighlighting
          onPress={look.onMention ? () => look.onMention?.(mentioned) : undefined}
          style={[style, accentText(look)]}
        >
          {span.text}
        </RNText>
      );
    }
    if (span.href) {
      return <LinkText key={i} link={{ kind: "url", text: span.text, href: span.href }} look={look} style={style} />;
    }
    if (span.style.code) {
      return (
        <RNText key={i} style={style}>
          {span.text}
        </RNText>
      );
    }
    const parts: ReactNode[] = segmentText(span.text).map((segment, n) =>
      segment.kind === "text" ? (
        segment.text.includes("@") ? (
          <Fragment key={n}>{mentionText(segment.text, look)}</Fragment>
        ) : (
          segment.text
        )
      ) : (
        <LinkText key={n} link={segment} look={look} style={style} />
      ),
    );
    return style ? (
      <RNText key={i} style={style}>
        {parts}
      </RNText>
    ) : (
      <Fragment key={i}>{parts}</Fragment>
    );
  });
}

function mentionText(value: string, look: Look): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(/(^|[^\w@])(@[^:\s]+:[^\s,;!?]+|@[A-Za-z0-9_]{2,32})\b/g)) {
    const start = (match.index ?? 0) + match[1].length;
    parts.push(value.slice(cursor, start));
    parts.push(
      <RNText key={start} style={accentText(look)}>
        {match[2]}
      </RNText>,
    );
    cursor = start + match[2].length;
  }
  parts.push(value.slice(cursor));
  return parts;
}

function LinkText({ link, look, style }: { link: LinkSegment; look: Look; style: TextStyle | null }) {
  return (
    <RNText
      accessibilityRole="link"
      suppressHighlighting
      onPress={() => openLink(link)}
      onLongPress={() => look.onHold(link)}
      style={[style, { textDecorationLine: "underline", color: look.fromMe ? look.colors.fg : look.colors.accent }]}
    >
      {link.text}
    </RNText>
  );
}
