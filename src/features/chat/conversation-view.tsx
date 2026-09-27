import { useState } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ChatBackground,
  EmptyState,
  Icon,
  Pressable,
  Text,
  toast,
  useEscapeKey,
  useLayoutInsets,
} from '@/design';
import { isLocalConversation } from '@/core/messaging/bots';
import { type MessageHistoryState, selfIdFor, useChatStore } from '@/core/messaging/chat-store';
import type {
  ChatMessage,
  Conversation,
  ConversationId,
  MessageContent,
  MessageId,
} from '@/core/messaging/types';
import { useAppearanceStore } from '@/core/app/appearance';
import { errorMessage } from '@/core/errors';
import { Composer } from './composer';
import { ConsentBar } from './consent-bar';
import { CommandPending } from './command-pending';
import { ForwardSheet } from './forward-sheet';
import { MessageList } from './message-list';
import {
  conversationPeers,
  conversationTitle,
  type DisplayParticipant,
} from '@/core/messaging/display-names';
import { useDisplayNames } from './use-display-names';
import { useSupports } from './use-supports';
import { useComposerMode } from './composer-mode';
import { usePinnedMessages } from './use-pinned-messages';
import { type ActionSupport, type ConversationActions, messageActions } from './message-commands';
import { HistoryStatus } from './history-status';
import { useConversationTimeline } from './use-conversation-timeline';
import { PinnedMessages } from './pinned-messages';
import { ConversationHeader } from './conversation-header';
import { DeleteMessageSheet, type DeleteTarget } from './delete-message-sheet';
import { MessageRow, replyPreview } from './message-row';

export interface ConversationViewProps {
  id: ConversationId;
  /** Shows this thread: the message that started it and the replies to it. */
  thread?: MessageId;
  onOpenThread?(root: MessageId): void;
  onBack(): void;
}

export function ConversationView({ id, thread, onOpenThread, onBack }: ConversationViewProps) {
  const wallpaper = useAppearanceStore((s) => s.wallpaper);
  // On desktop the frame draws the wallpaper and the sidebar does the navigating.
  const desktop = process.env.EXPO_OS === 'web';
  useEscapeKey(Boolean(thread), onBack);
  const insets = useSafeAreaInsets();
  const frame = useLayoutInsets();

  const sessions = useChatStore((s) => s.sessions);
  const conversation = useChatStore((s) => s.conversations.find((c) => c.id === id));
  const sendMessage = useChatStore((s) => s.sendMessage);
  const retryMessage = useChatStore((s) => s.retryMessage);
  const react = useChatStore((s) => s.react);
  const votePoll = useChatStore((s) => s.votePoll);
  const setMessagePinned = useChatStore((s) => s.setMessagePinned);
  const ingestMessage = useChatStore((s) => s.ingestMessage);

  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [showPinned, setShowPinned] = useState(false);

  const selfId = selfIdFor({ sessions }, conversation?.protocol);

  const isBot = isLocalConversation(id);

  const { session, supports, threads } = useSupports(id);
  const {
    allMessages,
    messages,
    byId,
    replyCounts,
    messageHistory,
    loadOlderMessages,
    list,
    followNewest,
    loadEarlier,
    highlighted,
  } = useConversationTimeline(id, thread, conversation, session, Boolean(onOpenThread));
  const { nameFor } = useDisplayNames(
    conversation ? chatPeople(conversation, selfId, allMessages) : []
  );
  const pinnedMessages = usePinnedMessages(
    id,
    allMessages,
    !thread && supports('listPinnedMessages')
  );
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const runCommand = (command: string) => setPendingCommand(command);
  const clearPendingCommand = () => setPendingCommand(null);

  const onSendContent = async (content: MessageContent) => {
    followNewest();
    await sendMessage(id, content, undefined, thread);
  };

  const previewOf = (target: ChatMessage) => replyPreview(target, nameFor);

  const composer = useComposerMode(id, followNewest, thread);

  const onReactTo = (messageId: string, emoji: string) => {
    react(id, messageId, emoji).catch((e) => toast.error(errorMessage(e, 'Could not react')));
  };
  const onPinMessage = async (message: ChatMessage) => {
    try {
      const isPinned = !message.isPinned;
      await setMessagePinned(id, message.id, isPinned);
      ingestMessage({ ...message, isPinned });
    } catch (error) {
      toast.error(errorMessage(error, 'Could not change pinned message'));
    }
  };

  const isGroup = conversation?.kind === 'group';
  const botName = conversation?.title ?? 'Bot';
  const handlers: ConversationActions = {
    reply: (message) => composer.reply(message),
    openThread: (message) => onOpenThread?.(message.threadRoot ?? message.id),
    forward: setForwarding,
    edit: (message) => composer.edit(message),
    remove: (message, forEveryone) => setDeleting({ message, forEveryone }),
    retry: (message) => void retryMessage(id, message.id),
    togglePin: (message) => void onPinMessage(message),
  };
  const can: ActionSupport = {
    edit: supports('editMessage'),
    delete: supports('deleteMessage'),
    deleteForMe: supports('deleteMessageForMe'),
    deleteOthers: conversation?.canDeleteOthers ?? false,
    pin: supports('setMessagePinned') && conversation?.canPin !== false,
    thread: threads && onOpenThread !== undefined,
  };
  const actionsFor = (message: ChatMessage) => messageActions(message, handlers, can);
  const onVote = supports('votePoll')
    ? (messageId: MessageId, optionIds: number[]) => votePoll(id, messageId, optionIds)
    : undefined;

  const renderItem = (item: ChatMessage, index: number) => (
    <MessageRow
      message={item}
      previous={messages[index - 1]}
      highlighted={item.id === highlighted}
      replyTarget={item.replyTo ? byId.get(item.replyTo) : undefined}
      nameFor={nameFor}
      senderName={isBot ? botName : nameFor(item.senderId)}
      isGroup={isGroup}
      onCommand={runCommand}
      actionsFor={actionsFor}
      onReact={item.privateToMe ? undefined : onReactTo}
      onVote={onVote}
      replies={onOpenThread ? (replyCounts.get(item.id) ?? 0) : 0}
      onOpenThread={onOpenThread}
    />
  );

  const chatTitle = conversation
    ? conversationTitle(conversation, selfId, nameFor)
    : 'Conversation';

  return (
    <View className={desktop ? 'flex-1' : 'flex-1 bg-canvas'}>
      {desktop ? null : <ChatBackground pattern={wallpaper} />}

      <ConversationHeader
        id={id}
        thread={thread}
        conversation={conversation}
        selfId={selfId}
        chatTitle={chatTitle}
        onBack={onBack}
      />

      <PinnedMessages
        messages={pinnedMessages}
        visible={showPinned}
        onOpen={() => setShowPinned(true)}
        onClose={() => setShowPinned(false)}
        onUnpin={(message) => void onPinMessage(message)}
        top={insets.top + frame.top + 62}
      />

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        {messages.length === 0 ? (
          <View className="flex-1">
            <HistoryStatus protocol={conversation?.protocol} />
            {messageHistory || isBot ? (
              <EmptyTranscript protocol={conversation?.protocol} isBot={isBot} />
            ) : null}
          </View>
        ) : (
          <MessageList
            key={id}
            ref={list}
            messages={messages}
            renderMessage={renderItem}
            onStartReached={loadEarlier}
            header={
              <View>
                {!thread && messageHistory?.hasOlder ? (
                  <LoadEarlierButton
                    history={messageHistory}
                    onPress={() => void loadOlderMessages(id)}
                  />
                ) : null}
                {!isBot && conversation?.protocol ? (
                  <HistoryStatus protocol={conversation.protocol} />
                ) : null}
              </View>
            }
            footer={running ? <CommandPending label={`Running ${running}…`} /> : null}
            topInset={insets.top + frame.top + (pinnedMessages.length ? 116 : 62)}
          />
        )}

        <View style={{ paddingBottom: insets.bottom }}>
          {conversation?.consent === 'unknown' ? (
            <ConsentBar conversationId={id} />
          ) : conversation?.kind === 'channel' && conversation.canSend !== true ? (
            <ChannelMuteBar id={id} />
          ) : conversation?.canSend === false ? (
            <View className="mx-gutter mb-2 min-h-tap items-center justify-center rounded-pill border border-line bg-surface-raised px-4">
              <Text variant="caption">You cannot send messages in this chat.</Text>
            </View>
          ) : (
            <Composer
              conversationId={id}
              thread={thread}
              onSendText={(text) => composer.submit(text)}
              onSendContent={onSendContent}
              editing={composer.mode.kind === 'edit'}
              banner={composer.banner(previewOf)}
              onCancelBanner={() => composer.cancel()}
              pendingCommand={pendingCommand}
              onPendingCommandHandled={clearPendingCommand}
              onRunningChange={(command) => {
                setRunning(command);
                if (command) followNewest();
              }}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      <ForwardSheet
        message={forwarding}
        from={id}
        nameFor={nameFor}
        onClose={() => setForwarding(null)}
      />
      <DeleteMessageSheet conversationId={id} target={deleting} onClose={() => setDeleting(null)} />
    </View>
  );
}

function chatPeople(
  conversation: Conversation,
  selfId: string,
  messages: ChatMessage[]
): DisplayParticipant[] {
  const members = conversationPeers(conversation, selfId);
  const listed = new Set(members.map((member) => member.id));
  const writers = new Set(
    messages
      .filter((message) => !message.fromMe && !listed.has(message.senderId))
      .map((message) => message.senderId)
  );
  return [...members, ...[...writers].map((id) => ({ id, protocol: conversation.protocol }))];
}

function EmptyTranscript({ protocol, isBot }: { protocol: string | undefined; isBot: boolean }) {
  const fetchingHistory = useChatStore(
    (s) => !!protocol && s.protocols[protocol]?.history?.status === 'fetching'
  );
  return (
    <EmptyState
      icon={isBot ? 'sparkles-outline' : 'lock-closed-outline'}
      title={fetchingHistory ? 'Fetching history…' : 'No messages yet'}
      description={
        isBot
          ? 'Type /commands to see what you can do in this chat.'
          : 'Messages are end-to-end encrypted. Type /commands to see what you can do here.'
      }
    />
  );
}

function LoadEarlierButton({
  history,
  onPress,
}: {
  history: MessageHistoryState;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        history.error ? `Retry loading earlier messages. ${history.error}` : 'Load earlier messages'
      }
      disabled={history.loading}
      onPress={onPress}
      className="items-center px-gutter py-3">
      <Text variant="caption" className={history.error ? 'text-danger' : undefined}>
        {history.loading
          ? 'Loading earlier messages…'
          : history.error
            ? `${history.error} · Retry`
            : 'Load earlier messages'}
      </Text>
    </Pressable>
  );
}

function ChannelMuteBar({ id }: { id: ConversationId }) {
  const muted = useChatStore((s) => Boolean(s.chatPrefs[id]?.muted));
  const setChatPref = useChatStore((s) => s.setChatPref);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={muted ? 'Unmute channel' : 'Mute channel'}
      onPress={() => void setChatPref(id, { muted: !muted })}
      className="mx-gutter mb-2 min-h-tap flex-row items-center justify-center gap-2 rounded-pill border border-line bg-surface-raised">
      <Icon name={muted ? 'volume-high-outline' : 'volume-mute-outline'} size={18} tone="brand" />
      <Text className="font-semibold text-brand">{muted ? 'Unmute' : 'Mute'}</Text>
    </Pressable>
  );
}
