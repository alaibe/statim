import { router } from 'expo-router';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ActionSheet, cn, Text } from '@/design';
import { type LinkSegment, segmentText } from '@/core/messaging/links';
import { type Block, listMarker, parseMarkdown, type Span } from '@/core/messaging/markdown';
import type { ParticipantId, ChatId } from '@/core/messaging/types';

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
}: {
  text: string;
  fromMe: boolean;
  className?: string;
  /** With `onCommand`, an address offers to send funds where /send can run. */
  chatId?: ChatId;
  onCommand?: (command: string) => void;
}) {
  const [held, setHeld] = useState<LinkSegment | null>(null);
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
  const only = blocks.length === 1 ? blocks[0] : undefined;

  return (
    <>
      {only?.kind === 'paragraph' ? (
        <Text className={className}>
          <Spans spans={only.spans} look={look} />
        </Text>
      ) : (
        <View className="gap-1">
          <Blocks blocks={blocks} look={look} />
        </View>
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
          <Text key={i} className={cn(className, block.kind === 'heading' && 'font-bold', gap)}>
            <Spans spans={block.spans} look={look} />
          </Text>
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
            <Text selectable className={cn(className, 'font-mono text-footnote')}>
              {block.text}
            </Text>
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
