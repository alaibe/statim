import { router } from 'expo-router';
import { Fragment, use, useMemo, useState, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';

import { ActionSheet, cn, Text } from '@/design';
import { type LinkSegment, segmentText } from '@/core/messaging/links';
import { type Block, listMarker, parseMarkdown, type Span } from '@/core/messaging/markdown';
import type { ParticipantId, ChatId } from '@/core/messaging/types';

import { HeldBubble } from './bubble-shell';
import { linkActions, openLink } from './link-actions';
import { useOffersSend } from './use-offers-send';

interface Look {
  fromMe: boolean;
  className?: string;
  onHold: (link: LinkSegment) => void;
  onMention?: (id: ParticipantId) => void;
}

export function MessageText({
  text,
  fromMe,
  className,
  chatId,
  onCommand,
  footer,
}: {
  text: string;
  fromMe: boolean;
  className?: string;
  /** The time, at the end of a one-paragraph text; `label` is what it reads, to keep its room free. */
  footer?: { node: ReactNode; label: string };
  /** With `onCommand`, an address offers to send funds where /send can run. */
  chatId?: ChatId;
  onCommand?: (command: string) => void;
}) {
  const [held, setHeld] = useState<LinkSegment | null>(null);
  const lifted = use(HeldBubble);
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const canSend = useOffersSend(chatId, onCommand);
  const look: Look = {
    fromMe,
    className,
    onHold: setHeld,
    onMention: chatId
      ? (member) => router.push({ pathname: '/profile/[id]', params: { id: chatId, member } })
      : undefined,
  };
  // The time's room at the end of the line is text, which a selection would take.
  const only = blocks.length === 1 && !lifted ? blocks[0] : undefined;

  return (
    <>
      {only?.kind === 'paragraph' ? (
        <View>
          <Text className={className}>
            <Spans spans={only.spans} look={look} />
            {footer ? (
              <Text variant="micro" className="opacity-0">{`\u2002\u2002${footer.label}`}</Text>
            ) : null}
          </Text>
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
        <ActionSheet
          visible
          onClose={() => setHeld(null)}
          title={held.text}
          actions={linkActions(held, canSend ? onCommand : undefined)}
        />
      ) : null}
    </>
  );
}

function Blocks({ blocks, look }: { blocks: readonly Block[]; look: Look }) {
  const { fromMe, className } = look;
  return blocks.map((block, i) => {
    const gap = block.spaced ? 'mt-1.5' : undefined;
    switch (block.kind) {
      case 'paragraph':
      case 'heading':
        return (
          <Paragraph
            key={i}
            className={cn(className, block.kind === 'heading' && 'font-bold', gap)}>
            <Spans spans={block.spans} look={look} />
          </Paragraph>
        );
      case 'code':
        return (
          <View
            key={i}
            style={{ borderCurve: 'continuous' }}
            className={cn(
              'rounded-lg px-2.5 py-1.5',
              fromMe ? 'bg-bubble-out-on/15' : 'bg-content/5',
              gap
            )}>
            <Paragraph selectable className={cn(className, 'font-mono text-footnote')}>
              {block.text}
            </Paragraph>
          </View>
        );
      case 'quote':
        return (
          <View key={i} className={cn('flex-row gap-2', gap)}>
            <View
              className={cn('w-0.5 rounded-full', fromMe ? 'bg-bubble-out-on/60' : 'bg-brand')}
            />
            <View className="min-w-0 flex-1 gap-1">
              <Blocks blocks={block.blocks} look={look} />
            </View>
          </View>
        );
      case 'list':
        return (
          <View key={i} className={cn('gap-0.5', gap)}>
            {block.items.map((item, n) => (
              <View key={n} className="flex-row gap-1.5">
                <Text className={className}>{listMarker(block, n)}</Text>
                <View className="min-w-0 flex-1 gap-1">
                  <Blocks blocks={item} look={look} />
                </View>
              </View>
            ))}
          </View>
        );
      case 'rule':
        return (
          <View
            key={i}
            className={cn('my-1 h-px', fromMe ? 'bg-bubble-out-on/30' : 'bg-line', gap)}
          />
        );
    }
  });
}

/** In a held bubble on iOS, a UITextView: a selectable Text there only copies the whole of itself. */
function Paragraph({
  className,
  selectable,
  children,
}: {
  className?: string;
  selectable?: boolean;
  children: ReactNode;
}) {
  const lifted = use(HeldBubble);
  if (lifted && process.env.EXPO_OS === 'ios') {
    return (
      <TextInput readOnly multiline scrollEnabled={false} className={cn(className, 'p-0')}>
        <Text className={className}>{children}</Text>
      </TextInput>
    );
  }
  return (
    <Text selectable={lifted || selectable} className={className}>
      {children}
    </Text>
  );
}

function Spans({ spans, look }: { spans: readonly Span[]; look: Look }) {
  return spans.map((span, i) => {
    const style = cn(
      span.style.bold && 'font-bold',
      span.style.italic && 'italic',
      span.style.strike && 'line-through'
    );
    const mentioned = span.mention;
    if (mentioned) {
      return (
        <Text
          key={i}
          accessibilityRole={look.onMention ? 'link' : undefined}
          suppressHighlighting
          onPress={look.onMention ? () => look.onMention?.(mentioned) : undefined}
          className={cn(
            look.className,
            style,
            'font-semibold',
            look.fromMe ? 'text-bubble-out-on' : 'text-brand'
          )}>
          {span.text}
        </Text>
      );
    }
    if (span.href) {
      return (
        <LinkText
          key={i}
          link={{ kind: 'url', text: span.text, href: span.href }}
          look={look}
          className={style}
        />
      );
    }
    if (span.style.code) {
      return (
        <Text
          key={i}
          className={cn(
            look.className,
            style,
            'font-mono',
            look.fromMe ? 'bg-bubble-out-on/15' : 'bg-content/5'
          )}>
          {span.text}
        </Text>
      );
    }
    const parts: ReactNode[] = segmentText(span.text).map((segment, n) =>
      segment.kind === 'text' ? (
        segment.text.includes('@') ? (
          <Fragment key={n}>{mentionText(segment.text, look)}</Fragment>
        ) : (
          segment.text
        )
      ) : (
        <LinkText key={n} link={segment} look={look} className={style} />
      )
    );
    return style ? (
      <Text key={i} className={cn(look.className, style)}>
        {parts}
      </Text>
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
      <Text
        key={start}
        className={cn('font-semibold', look.fromMe ? 'text-bubble-out-on' : 'text-brand')}>
        {match[2]}
      </Text>
    );
    cursor = start + match[2].length;
  }
  parts.push(value.slice(cursor));
  return parts;
}

function LinkText({
  link,
  look,
  className,
}: {
  link: LinkSegment;
  look: Look;
  className?: string;
}) {
  return (
    <Text
      accessibilityRole="link"
      suppressHighlighting
      onPress={() => openLink(link)}
      onLongPress={() => look.onHold(link)}
      className={cn(look.className, className, 'underline', !look.fromMe && 'text-brand')}>
      {link.text}
    </Text>
  );
}
