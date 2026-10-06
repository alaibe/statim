import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';

import { cn, Text } from '@/design';
import { usePluginHost } from '@/core/plugins/host';
import { sessionFor, useChatStore } from '@/core/messaging/chat-store';
import { hasReactions } from '@/core/messaging/reactions';
import type { ChatMessage, LiveView, MessageId, WidgetContent } from '@/core/messaging/types';
import type { MessageAction } from './message-actions';
import { BubbleShell, type ReplyPreview, type ThreadChip } from './bubble-shell';
import { ReactionRow } from './reaction-row';
import { findTransactionHash } from '@/lib/evm/transactions';
import { segmentText, type LinkSegment } from '@/core/messaging/links';
import { labelledLinks, plainText } from '@/core/messaging/markdown';
import { parseLocation } from '@/core/messaging/locations';
import { AddressPreview } from './address-preview';
import { LinkPreviewCard } from './link-preview-card';
import { LocationCard } from './location-card';
import { MessageText } from './message-text';
import { PluginPreview } from './plugin-preview';
import { TransactionPreview } from './transaction-preview';
import { WidgetView } from '@/design/widgets/widget-view';
import { useLiveWidget } from './use-live-widget';
import { FileBubble } from './attachments/file-bubble';
import { ImageBubble } from './attachments/image-bubble';
import { StickerBubble } from './attachments/sticker-bubble';
import { VoiceBubble } from './attachments/voice-bubble';
import { VideoBubble } from './attachments/video-bubble';
import { PollBubble } from './poll-bubble';
import { awaitsFile, formatTimestamp } from '@/core/messaging/preview';
import { DeliveryIcon } from './delivery-icon';
import { openUrlQuietly } from './link-actions';
import { mediaSaver } from './message-commands';

export type { ReplyPreview } from './bubble-shell';

interface MessageBubbleProps {
  message: ChatMessage;
  grouped: boolean;
  tail: boolean;
  read: boolean;
  senderName: string;
  showSender: boolean;
  selfId: string;
  nameFor: (id: string) => string;
  onCommand?: (command: string) => void;
  onReact?: (emoji: string) => void;
  onVote?: (optionIds: number[]) => Promise<void>;
  actions: () => MessageAction[];
  replyPreview?: ReplyPreview;
  thread?: ThreadChip;
}

export function MessageBubble({
  message,
  grouped,
  tail,
  read,
  senderName,
  showSender,
  selfId,
  nameFor,
  onCommand,
  onReact,
  onVote,
  actions,
  replyPreview,
  thread,
}: MessageBubbleProps) {
  const { registry } = usePluginHost();
  useMissingMedia(message);

  const { fromMe, content } = message;

  if (content.kind === 'system') {
    return (
      <View className="items-center py-2">
        <View className="rounded-pill bg-surface-sunken px-3 py-1">
          <Text variant="caption">{content.text}</Text>
        </View>
      </View>
    );
  }

  if (content.kind === 'reaction') return null;

  const reactionRow = (inBubble: boolean) =>
    hasReactions(message) ? (
      <ReactionRow
        reactions={message.reactions}
        fromMe={fromMe}
        inBubble={inBubble}
        selfId={selfId}
        nameFor={nameFor}
        onReact={onReact}
      />
    ) : null;
  const footer: FooterProps = { message, read, reactions: reactionRow(true) };

  const withFooter = (media: ReactNode, overlay: boolean) =>
    overlay ? (
      <View>
        {media}
        <Footer {...footer} place="overlay" />
      </View>
    ) : (
      <>
        {media}
        <Footer {...footer} />
      </>
    );

  let bare = false;
  let children: React.ReactNode;

  switch (content.kind) {
    case 'widget':
      bare = true;
      children = content.live ? (
        <LiveWidget content={content} onCommand={onCommand} />
      ) : (
        <WidgetView widget={content.widget} onCommand={onCommand} onOpenUrl={openUrlQuietly} />
      );
      break;

    case 'custom': {
      const custom = registry.customRenderer(content.typeId, content.data);
      if (custom) {
        const Renderer = custom.render;
        bare = true;
        children = (
          <Renderer
            data={custom.data}
            message={message}
            fromMe={fromMe}
            context={custom.context}
            onCommand={onCommand}
          />
        );
      } else {
        children = (
          <TextBody footer={footer} text={content.fallback ?? 'Rich message'} unsupported />
        );
      }
      break;
    }

    case 'image':
    case 'video': {
      const onSave = mediaSaver(message);
      const media =
        content.kind === 'image' ? (
          <ImageBubble
            uri={content.uri}
            width={content.width}
            height={content.height}
            caption={content.caption}
            fromMe={fromMe}
            onSave={onSave}
          />
        ) : (
          <VideoBubble
            uri={content.uri}
            width={content.width}
            height={content.height}
            durationMs={content.durationMs}
            caption={content.caption}
            gif={content.gif}
            fromMe={fromMe}
            onSave={onSave}
          />
        );
      bare = !content.caption && !replyPreview;
      children = withFooter(media, bare);
      break;
    }

    case 'sticker':
      bare = !replyPreview;
      children = withFooter(<StickerBubble sticker={content} />, bare);
      break;

    case 'file':
      children = (
        <>
          <FileBubble
            uri={content.uri}
            name={content.name}
            mimeType={content.mimeType}
            size={content.size}
            fromMe={fromMe}
          />
          <Footer {...footer} />
        </>
      );
      break;

    case 'voice':
      children = (
        <>
          <VoiceBubble
            uri={content.uri}
            durationMs={content.durationMs}
            fromMe={fromMe}
            seed={message.id}
          />
          <Footer {...footer} />
        </>
      );
      break;

    case 'poll':
      children = (
        <>
          <PollBubble poll={content} fromMe={fromMe} onVote={onVote} />
          <Footer {...footer} />
        </>
      );
      break;

    case 'text':
      children = <TextBody footer={footer} text={content.text} onCommand={onCommand} />;
      break;

    default:
      children = <TextBody footer={footer} text={content.fallback} unsupported />;
  }

  return (
    <BubbleShell
      fromMe={fromMe}
      grouped={grouped}
      tail={tail}
      senderName={senderName}
      showSender={showSender}
      below={bare ? reactionRow(false) : null}
      privateToMe={message.privateToMe}
      onReact={onReact}
      actions={actions}
      replyPreview={replyPreview}
      thread={thread}
      bare={bare}>
      {children}
    </BubbleShell>
  );
}

function TextBody({
  footer,
  text,
  unsupported = false,
  onCommand,
}: {
  footer: FooterProps;
  text: string;
  unsupported?: boolean;
  onCommand?: (command: string) => void;
}) {
  const { message } = footer;
  const { fromMe } = message;
  const className = cn('text-body', fromMe ? 'text-bubble-out-on' : 'text-bubble-in-on');
  const plain = plainText(text);
  const claimed = useTextPreview(plain);

  if (unsupported) {
    return (
      <>
        <Text className={cn(className, 'italic opacity-80')}>{text}</Text>
        <Footer {...footer} />
      </>
    );
  }

  const segments = claimed ? [] : segmentText(plain);
  const transactionHash = claimed ? null : findTransactionHash(plain);
  const link =
    segments.find((s): s is LinkSegment => s.kind === 'url' || s.kind === 'location') ??
    (claimed ? [] : labelledLinks(text)).map(
      (href): LinkSegment => ({ kind: 'url', text: href, href })
    )[0];
  const location = link ? parseLocation(link.href) : null;
  const account = segments.find((s) => s.kind === 'address' || s.kind === 'ens');
  const pluginCard = fromMe ? null : claimed;
  const inline =
    !transactionHash &&
    !location &&
    link?.kind !== 'url' &&
    !account &&
    !pluginCard &&
    !hasReactions(message);

  return (
    <>
      <MessageText
        text={text}
        fromMe={fromMe}
        className={className}
        chatId={message.chatId}
        onCommand={onCommand}
        footer={
          inline
            ? { node: <Footer {...footer} place="inline" />, label: footerLabel(message) }
            : undefined
        }
      />

      {transactionHash ? <TransactionPreview hash={transactionHash} fromMe={fromMe} /> : null}
      {location ? (
        <LocationCard location={location} fromMe={fromMe} />
      ) : link?.kind === 'url' ? (
        <LinkPreviewCard url={link.href} fromMe={fromMe} />
      ) : null}
      {account ? (
        <AddressPreview value={account.text} chatId={message.chatId} onCommand={onCommand} />
      ) : null}
      {pluginCard ? <PluginPreview live={pluginCard} onCommand={onCommand} /> : null}

      {inline ? null : <Footer {...footer} />}
    </>
  );
}

function useTextPreview(plain: string): LiveView | null {
  const { registry } = usePluginHost();
  return registry.textPreview(plain);
}

function timeLabel(message: ChatMessage): string {
  return `${message.edited ? 'edited ' : ''}${formatTimestamp(message.sentAt)}`;
}

/** The time's text, with room for the ticks on your own messages. */
function footerLabel(message: ChatMessage): string {
  return message.fromMe ? `${timeLabel(message)}\u2003\u2002` : timeLabel(message);
}

interface FooterProps {
  message: ChatMessage;
  read: boolean;
  reactions: ReactNode;
}

/** `overlay` sits the time on a photo that has no bubble around it; `inline` at the end of the text's last line. */
function Footer({
  message,
  read,
  reactions,
  place = 'row',
}: FooterProps & { place?: 'row' | 'overlay' | 'inline' }) {
  const overlay = place === 'overlay';
  const time = (
    <View
      className={cn(
        'flex-row items-center gap-1',
        overlay && 'absolute bottom-1.5 right-1.5 rounded-pill bg-black/45 px-1.5 py-0.5'
      )}>
      <Text
        variant="micro"
        className={
          overlay ? 'text-white' : message.fromMe ? 'text-bubble-out-on/60' : 'text-content-subtle'
        }>
        {timeLabel(message)}
      </Text>
      {message.fromMe ? (
        <DeliveryIcon
          message={message}
          read={read}
          size={13}
          tone="bubble-out-on"
          color={overlay ? '#fff' : undefined}
        />
      ) : null}
    </View>
  );
  if (place !== 'row') return time;
  if (reactions) {
    return (
      <View className="mt-1 flex-row items-end gap-3">
        <View className="min-w-0 flex-1">{reactions}</View>
        {time}
      </View>
    );
  }
  return <View className="-mt-0.5 flex-row justify-end">{time}</View>;
}

function LiveWidget({
  content,
  onCommand,
}: {
  content: WidgetContent;
  onCommand?: (command: string) => void;
}) {
  return (
    <WidgetView widget={useLiveWidget(content)} onCommand={onCommand} onOpenUrl={openUrlQuietly} />
  );
}

const requestedMedia = new Set<MessageId>();

function useMissingMedia({ id, chatId, content }: ChatMessage) {
  const missing = awaitsFile(content);
  useEffect(() => {
    if (!missing || requestedMedia.has(id)) return;
    const store = useChatStore.getState();
    if (!sessionFor(store, chatId)?.fetchMedia) return;
    requestedMedia.add(id);
    store.fetchMedia(chatId, id).catch(() => requestedMedia.delete(id));
  }, [missing, id, chatId]);
}
