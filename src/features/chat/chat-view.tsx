import { type ReactNode, useState } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ChatBackground,
  EmptyState,
  Pressable,
  Text,
  toast,
  useEscapeKey,
  useLayoutInsets,
} from '@/design';
import { isLocalChat } from '@/core/messaging/bots';
import { prefsFor } from '@/core/messaging/chat-prefs';
import {
  connectionFor,
  type MessageHistoryState,
  selfIdFor,
  useChatStore,
} from '@/core/messaging/chat-store';
import { readByPeer } from '@/core/messaging/unread';
import { protocolOf, type ProtocolId } from '@/core/messaging/namespace';
import type { ChatPermissions } from '@/core/messaging/permissions';
import type { ChatMessage, Chat, ChatId, MessageContent, MessageId } from '@/core/messaging/types';
import { useAppearanceStore } from '@/core/app/appearance';
import { errorMessage } from '@/core/errors';
import { Composer } from './composer';
import { BarButton } from './bar-button';
import { BlockedBar } from './block';
import { RequestBar } from './request-bar';
import { CommandPending } from './command-pending';
import { ForwardSheet } from './forward-sheet';
import { MessageList } from './message-list';
import {
  chatParticipants,
  chatTitle,
  type DisplayParticipant,
} from '@/core/messaging/display-names';
import { useDisplayNames } from './use-display-names';
import { useChatPermissions, useChatSession } from './use-chat-permissions';
import { useComposerMode } from './composer-mode';
import { usePinnedMessages } from './use-pinned-messages';
import { type ActionSupport, type ChatActions, messageActions } from './message-commands';
import { HistoryStatus } from './history-status';
import { useChatTimeline } from './use-chat-timeline';
import { PinnedMessages } from './pinned-messages';
import { ChatHeader, PendingChatHeader } from './chat-header';
import { DeleteMessageSheet, type DeleteTarget } from './delete-message-sheet';
import { MessageRow, replyPreview } from './message-row';

interface ChatViewProps {
  id: ChatId;
  /** Shows this thread: the message that started it and the replies to it. */
  thread?: MessageId;
  onOpenThread?(root: MessageId): void;
  onBack(): void;
}

export function ChatView({ id, thread, onOpenThread, onBack }: ChatViewProps) {
  const wallpaper = useAppearanceStore((s) => s.wallpaper);
  // On desktop the frame draws the wallpaper and the sidebar does the navigating.
  const desktop = process.env.EXPO_OS === 'web';
  useEscapeKey(Boolean(thread), onBack);
  const insets = useSafeAreaInsets();
  const frame = useLayoutInsets();

  const sessions = useChatStore((s) => s.sessions);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === id));
  const sendMessage = useChatStore((s) => s.sendMessage);

  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [showPinned, setShowPinned] = useState(false);

  const isBot = isLocalChat(id);
  const protocol = protocolOf(id);

  const session = useChatSession(id);
  const permissions = useChatPermissions(id);
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
  } = useChatTimeline(id, thread, session, Boolean(onOpenThread));
  const selfId = selfIdFor({ sessions }, protocol);
  const readUpTo = chat?.readUpTo ?? 0;
  const { nameFor } = useDisplayNames(chat ? chatPeople(chat, selfId, allMessages) : []);
  const pinnedMessages = usePinnedMessages(id, allMessages, !thread && permissions.seePins);
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

  const isGroup = chat?.kind === 'group';
  const botName = chat?.title ?? 'Bot';
  const { retry, onReactTo, onVote, togglePin } = useMessageStore(id, permissions.vote);
  const handlers: ChatActions = {
    reply: (message) => composer.reply(message),
    openThread: (message) => onOpenThread?.(message.threadRoot ?? message.id),
    forward: setForwarding,
    edit: (message) => composer.edit(message),
    remove: (message, forEveryone) => setDeleting({ message, forEveryone }),
    retry,
    togglePin: (message) => void togglePin(message),
  };
  const can: ActionSupport = {
    ...permissions,
    thread: permissions.thread && onOpenThread !== undefined,
  };
  const actionsFor = (message: ChatMessage) => messageActions(message, handlers, can);

  const renderItem = (item: ChatMessage, index: number) => (
    <MessageRow
      message={item}
      previous={messages[index - 1]}
      next={messages[index + 1]}
      highlighted={item.id === highlighted}
      replyTarget={item.replyTo ? byId.get(item.replyTo) : undefined}
      nameFor={nameFor}
      selfId={selfId}
      read={item.fromMe && readByPeer(readUpTo, item)}
      senderName={isBot ? botName : nameFor(item.senderId)}
      isGroup={isGroup}
      onCommand={runCommand}
      actionsFor={actionsFor}
      onReact={item.privateToMe || !permissions.react ? undefined : onReactTo}
      onVote={onVote}
      replies={onOpenThread ? (replyCounts.get(item.id) ?? 0) : 0}
      onOpenThread={onOpenThread}
    />
  );

  return (
    <View className={desktop ? 'flex-1' : 'flex-1 bg-canvas'}>
      {desktop ? null : <ChatBackground pattern={wallpaper} />}

      {chat ? (
        <ChatHeader chat={chat} thread={thread} nameFor={nameFor} onBack={onBack} />
      ) : (
        <PendingChatHeader thread={thread} onBack={onBack} />
      )}

      <PinnedMessages
        messages={pinnedMessages}
        visible={showPinned}
        onOpen={() => setShowPinned(true)}
        onClose={() => setShowPinned(false)}
        onUnpin={(message) => void togglePin(message)}
        top={insets.top + frame.top + 62}
      />

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        {messages.length === 0 ? (
          <View className="flex-1">
            <HistoryStatus protocol={protocol} />
            {messageHistory || isBot ? <EmptyTranscript protocol={protocol} isBot={isBot} /> : null}
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
                {!isBot ? <HistoryStatus protocol={protocol} /> : null}
              </View>
            }
            footer={running ? <CommandPending label={`Running ${running}…`} /> : null}
            topInset={insets.top + frame.top + (pinnedMessages.length ? 116 : 62)}
          />
        )}

        <View style={{ paddingBottom: insets.bottom }}>
          {chat ? (
            <ChatBar chat={chat} permissions={permissions} title={chatTitle(chat, selfId, nameFor)}>
              <Composer
                chatId={id}
                kind={chat.kind}
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
            </ChatBar>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {forwarding ? (
        <ForwardSheet
          message={forwarding}
          from={id}
          nameFor={nameFor}
          onClose={() => setForwarding(null)}
        />
      ) : null}
      {deleting ? (
        <DeleteMessageSheet chatId={id} target={deleting} onClose={() => setDeleting(null)} />
      ) : null}
    </View>
  );
}

function useMessageStore(id: ChatId, votes: boolean) {
  const retryMessage = useChatStore((s) => s.retryMessage);
  const react = useChatStore((s) => s.react);
  const votePoll = useChatStore((s) => s.votePoll);
  const setMessagePinned = useChatStore((s) => s.setMessagePinned);
  const ingestMessage = useChatStore((s) => s.ingestMessage);
  return {
    retry: (message: ChatMessage) => void retryMessage(id, message.id),
    onReactTo: (messageId: string, emoji: string) => {
      react(id, messageId, emoji).catch((e) => toast.error(errorMessage(e, 'Could not react')));
    },
    onVote: votes
      ? (messageId: MessageId, optionIds: number[]) => votePoll(id, messageId, optionIds)
      : undefined,
    togglePin: async (message: ChatMessage) => {
      try {
        const isPinned = !message.isPinned;
        await setMessagePinned(id, message.id, isPinned);
        ingestMessage({ ...message, isPinned });
      } catch (error) {
        toast.error(errorMessage(error, 'Could not change pinned message'));
      }
    },
  };
}

function chatPeople(
  chat: Chat,
  selfId: string,
  messages: readonly ChatMessage[]
): DisplayParticipant[] {
  const members = chatParticipants(chat, selfId);
  const listed = new Set(members.map((member) => member.id));
  const writers = new Set(
    messages
      .filter((message) => !message.fromMe && !listed.has(message.senderId))
      .map((message) => message.senderId)
  );
  return [...members, ...[...writers].map((id) => ({ id, protocol: chat.protocol }))];
}

function EmptyTranscript({ protocol, isBot }: { protocol: ProtocolId; isBot: boolean }) {
  const fetchingHistory = useChatStore(
    (s) => connectionFor(s.protocols, protocol).history.status === 'fetching'
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

function ChatBar({
  chat,
  permissions,
  title,
  children,
}: {
  chat: Chat;
  permissions: ChatPermissions;
  title: string;
  children: ReactNode;
}) {
  if (chat.blocked) return <BlockedBar chatId={chat.id} />;
  if (chat.consent === 'request') {
    return <RequestBar chatId={chat.id} name={title} canBlock={permissions.block} />;
  }
  if (permissions.send) return children;
  if (chat.kind === 'channel') return <ChannelMuteBar id={chat.id} />;
  return (
    <View className="mx-gutter mb-2 min-h-tap items-center justify-center rounded-pill border border-line bg-surface-raised px-4">
      <Text variant="caption">You cannot send messages in this chat.</Text>
    </View>
  );
}

function ChannelMuteBar({ id }: { id: ChatId }) {
  const muted = useChatStore((s) => Boolean(prefsFor(s.chatPrefs, id).muted));
  const setChatPref = useChatStore((s) => s.setChatPref);
  return (
    <BarButton
      icon={muted ? 'volume-high-outline' : 'volume-mute-outline'}
      label={muted ? 'Unmute' : 'Mute'}
      accessibilityLabel={muted ? 'Unmute channel' : 'Mute channel'}
      onPress={() => void setChatPref(id, { muted: !muted })}
      className="mx-gutter mb-2"
    />
  );
}
