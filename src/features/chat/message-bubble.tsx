import { useContext, useEffect } from 'react';
import { View } from 'react-native';

import { cn, Text } from '@/design';
import { usePluginHost } from '@/core/plugins/host';
import { sessionFor, useChatStore } from '@/core/messaging/chat-store';
import type { ChatMessage, MessageId, WidgetContent } from '@/core/messaging/types';
import type { MessageAction } from './message-actions';
import { BubbleShell, type ReplyPreview, type ThreadChip } from './bubble-shell';
import { ReactionHandlers, ReactionRow, type Reactors } from './reaction-row';
import { findTransactionHash } from '@/lib/evm/transactions';
import { segmentText, type LinkSegment } from '@/core/messaging/links';
import { labelledLinks, plainText } from '@/core/messaging/markdown';
import { parseLocation } from '@/core/messaging/locations';
import { AddressPreview } from './address-preview';
import { LinkPreviewCard } from './link-preview-card';
import { LocationCard } from './location-card';
import { MessageText } from './message-text';
import { TransactionPreview } from './transaction-preview';
import { WidgetView } from '@/design/widgets/widget-view';
import { useLiveWidget } from './use-live-widget';
import { FileBubble } from './attachments/file-bubble';
import { ImageBubble } from './attachments/image-bubble';
import { VoiceBubble } from './attachments/voice-bubble';
import { VideoBubble } from './attachments/video-bubble';
import { PollBubble } from './poll-bubble';
import { awaitsFile, formatTimestamp } from '@/core/messaging/preview';
import { DeliveryIcon, useReadByPeer } from './delivery-icon';
import { openUrlQuietly } from './link-actions';

export type { ReplyPreview } from './bubble-shell';

export interface MessageBubbleProps {
  message: ChatMessage;
  grouped: boolean;
  tail?: boolean;
  senderName: string;
  showSender: boolean;
  reactors?: Reactors;
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
  senderName,
  showSender,
  reactors,
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
          <TextBody message={message} text={content.fallback ?? 'Rich message'} unsupported />
        );
      }
      break;
    }

    case 'image':
    case 'video': {
      const media =
        content.kind === 'image' ? (
          <ImageBubble
            uri={content.uri}
            width={content.width}
            height={content.height}
            caption={content.caption}
            fromMe={fromMe}
          />
        ) : (
          <VideoBubble
            uri={content.uri}
            width={content.width}
            height={content.height}
            caption={content.caption}
            gif={content.gif}
            fromMe={fromMe}
          />
        );
      bare = !content.caption && !replyPreview;
      children = bare ? (
        <View>
          {media}
          <Footer message={message} overlay />
        </View>
      ) : (
        <>
          {media}
          <Footer message={message} />
        </>
      );
      break;
    }

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
          <Footer message={message} />
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
          <Footer message={message} />
        </>
      );
      break;

    case 'poll':
      children = (
        <>
          <PollBubble poll={content} fromMe={fromMe} onVote={onVote} />
          <Footer message={message} />
        </>
      );
      break;

    case 'text':
      children = <TextBody message={message} text={content.text} onCommand={onCommand} />;
      break;

    default:
      children = <TextBody message={message} text={content.fallback} unsupported />;
  }

  return (
    <ReactionHandlers.Provider value={{ reactors, onReact }}>
      <BubbleShell
        fromMe={fromMe}
        grouped={grouped}
        tail={tail}
        senderName={senderName}
        showSender={showSender}
        reactions={message.reactions}
        reactors={reactors}
        privateToMe={message.privateToMe}
        onReact={onReact}
        actions={actions}
        replyPreview={replyPreview}
        thread={thread}
        bare={bare}>
        {children}
      </BubbleShell>
    </ReactionHandlers.Provider>
  );
}

function TextBody({
  message,
  text,
  unsupported = false,
  onCommand,
}: {
  message: ChatMessage;
  text: string;
  unsupported?: boolean;
  onCommand?: (command: string) => void;
}) {
  const { fromMe } = message;
  const className = cn('text-body', fromMe ? 'text-bubble-out-on' : 'text-bubble-in-on');

  if (unsupported) {
    return (
      <>
        <Text className={cn(className, 'italic opacity-80')}>{text}</Text>
        <Footer message={message} />
      </>
    );
  }

  const plain = plainText(text);
  const segments = segmentText(plain);
  const transactionHash = findTransactionHash(plain);
  const link =
    segments.find((s): s is LinkSegment => s.kind === 'url' || s.kind === 'location') ??
    labelledLinks(text).map((href): LinkSegment => ({ kind: 'url', text: href, href }))[0];
  const location = link ? parseLocation(link.href) : null;
  const account = segments.find((s) => s.kind === 'address' || s.kind === 'ens');
  const inline =
    !transactionHash && !location && link?.kind !== 'url' && !account && !reactedTo(message);

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
            ? { node: <Footer message={message} inline />, label: footerLabel(message) }
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

      {inline ? null : <Footer message={message} />}
    </>
  );
}

function reactedTo(message: ChatMessage): boolean {
  return !!message.reactions && Object.keys(message.reactions).length > 0;
}

/** What the time reads, with room for the ticks on your own messages. */
function footerLabel(message: ChatMessage): string {
  const time = `${message.edited ? 'edited ' : ''}${formatTimestamp(message.sentAt)}`;
  return message.fromMe ? `${time}\u2003\u2002` : time;
}

/**
 * `overlay` sits the time on a photo that has no bubble around it; `inline`
 * at the end of the text's last line. Otherwise it has a row of its own,
 * shared with the reactions like Telegram's.
 */
function Footer({
  message,
  overlay = false,
  inline = false,
}: {
  message: ChatMessage;
  overlay?: boolean;
  inline?: boolean;
}) {
  const { reactors, onReact } = useContext(ReactionHandlers);
  const read = useReadByPeer(message);
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
        {`${message.edited ? 'edited ' : ''}${formatTimestamp(message.sentAt)}`}
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
  if (overlay || inline) return time;
  if (message.reactions && reactedTo(message)) {
    return (
      <View className="mt-1 flex-row items-end gap-3">
        <View className="min-w-0 flex-1">
          <ReactionRow
            reactions={message.reactions}
            fromMe={message.fromMe}
            inBubble
            reactors={reactors}
            onReact={onReact}
          />
        </View>
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
