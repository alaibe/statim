import { type ReactNode, useState } from "react";
import { KeyboardAvoidingView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "@/core/errors";
import { isLocalChat } from "@/core/messaging/bots";
import { prefsFor } from "@/core/messaging/chat-prefs";
import { connectionFor, type MessageHistoryState, selfIdFor, useChatStore } from "@/core/messaging/chat-store";
import { chatParticipants, chatTitle, type DisplayParticipant } from "@/core/messaging/display-names";
import { type ProtocolId, protocolOf } from "@/core/messaging/namespace";
import type { ChatPermissions } from "@/core/messaging/permissions";
import type { Chat, ChatId, ChatMessage, MessageContent, MessageId } from "@/core/messaging/types";
import { readByPeer } from "@/core/messaging/unread";
import { Button, EmptyState, Notice, Skeleton, toast, useEscapeKey, useThemeColors } from "@/design";
import { BlockedBar } from "./block";
import { repliesLabel } from "./bubble-shell";
import { ChatHeader, PendingChatHeader } from "./chat-header";
import { CommandPending } from "./command-pending";
import { Composer } from "./composer";
import { useComposerMode } from "./composer-mode";
import { DeleteMessageSheet, type DeleteTarget } from "./delete-message-sheet";
import { useReadUpTo } from "./delivery-icon";
import { ForwardSheet } from "./forward-sheet";
import { HistoryStatus } from "./history-status";
import { type ActionSupport, type ChatActions, lastEditableMessage, messageActions } from "./message-commands";
import { MessageList } from "./message-list";
import { MessageRow, replyPreview } from "./message-row";
import { PinnedMessages } from "./pinned-messages";
import { RequestBar } from "./request-bar";
import { useChatPermissions, useChatSession } from "./use-chat-permissions";
import { useChatTimeline } from "./use-chat-timeline";
import { useDisplayNames } from "./use-display-names";
import { usePinnedMessages } from "./use-pinned-messages";

interface ChatViewProps {
  id: ChatId;
  thread?: MessageId;
  onOpenThread?(root: MessageId): void;
  onBack(): void;
}

export function ChatView({ id, thread, onOpenThread, onBack }: ChatViewProps) {
  const colors = useThemeColors();
  useEscapeKey(Boolean(thread), onBack);
  const insets = useSafeAreaInsets();

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
    newReplies,
    unseenReplies,
    messageHistory,
    loadMessages,
    loadOlderMessages,
    list,
    followNewest,
    loadEarlier,
    highlighted,
  } = useChatTimeline(id, thread, session, Boolean(onOpenThread));
  const selfId = selfIdFor({ sessions }, protocol);
  const readUpTo = useReadUpTo(chat);
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
  useEscapeKey(composer.mode.kind !== "compose", () => composer.cancel());

  const isGroup = chat?.kind === "group";
  const botName = chat?.title ?? "Bot";
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
  const lastEditable = lastEditableMessage(messages, can);

  const dividerAt = (index: number) => (thread ? threadDivider(thread, messages, index, unseenReplies) : undefined);
  const renderItem = (item: ChatMessage, index: number) => (
    <MessageRow
      message={item}
      previous={messages[index - 1]}
      divider={dividerAt(index)}
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
      newReplies={newReplies.get(item.id) ?? 0}
      onOpenThread={onOpenThread}
    />
  );

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1" style={{ backgroundColor: colors.bg }}>
      {chat ? (
        <ChatHeader chat={chat} thread={thread} nameFor={nameFor} onBack={onBack} />
      ) : (
        <PendingChatHeader thread={thread} onBack={onBack} />
      )}

      <View className="flex-1">
        <PinnedMessages
          messages={pinnedMessages}
          visible={showPinned}
          onOpen={() => setShowPinned(true)}
          onClose={() => setShowPinned(false)}
          onUnpin={permissions.pin ? (message) => void togglePin(message) : undefined}
          top={8}
        />

        {messages.length === 0 ? (
          <View className="flex-1">
            <HistoryStatus protocol={protocol} />
            <EmptyTranscript
              protocol={protocol}
              isBot={isBot}
              history={messageHistory}
              onRetry={() => void loadMessages(id)}
            />
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
                  <LoadEarlierButton history={messageHistory} onPress={() => void loadOlderMessages(id)} />
                ) : null}
                {!isBot ? <HistoryStatus protocol={protocol} /> : null}
              </View>
            }
            footer={running ? <CommandPending label={`Running ${running}…`} /> : null}
            topInset={pinnedMessages.length ? 62 : 0}
          />
        )}
      </View>

      <View style={{ paddingBottom: insets.bottom }}>
        {onOpenThread ? <NewRepliesBar counts={newReplies} onOpen={onOpenThread} /> : null}
        {chat ? (
          <ChatBar chat={chat} permissions={permissions} title={chatTitle(chat, selfId, nameFor)}>
            <Composer
              chatId={id}
              kind={chat.kind}
              thread={thread}
              onSendText={(text) => composer.submit(text)}
              onSendContent={onSendContent}
              editing={composer.mode.kind === "edit"}
              onEditLast={lastEditable ? () => composer.edit(lastEditable) : undefined}
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

      {forwarding ? <ForwardSheet message={forwarding} from={id} onClose={() => setForwarding(null)} /> : null}
      {deleting ? <DeleteMessageSheet chatId={id} target={deleting} onClose={() => setDeleting(null)} /> : null}
    </KeyboardAvoidingView>
  );
}

function threadDivider(
  root: MessageId,
  messages: readonly ChatMessage[],
  index: number,
  unseen: readonly ChatMessage[],
): string | undefined {
  const message = messages[index];
  const fresh = message?.id === unseen[0]?.id ? unseen.length : 0;
  if (index === 1 && messages[0]?.id === root) return repliesLabel(messages.length - 1, fresh);
  return fresh > 0 ? `${fresh} new` : undefined;
}

/** Thread replies are kept out of the timeline, so their unread ones are announced here. */
function NewRepliesBar({ counts, onOpen }: { counts: ReadonlyMap<MessageId, number>; onOpen(root: MessageId): void }) {
  const [oldest] = counts.keys();
  if (!oldest) return null;
  const replies = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const label = `${replies === 1 ? "1 new reply" : `${replies} new replies`}${
    counts.size > 1 ? ` in ${counts.size} threads` : " in a thread"
  }`;
  return (
    <View className="items-center pb-2">
      <Button
        size="sm"
        label={label}
        accessibilityLabel={`${label}. Open thread`}
        trailingIcon="arrow-right"
        onPress={() => onOpen(oldest)}
      />
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
    retry: (message: ChatMessage) => {
      retryMessage(id, message.id).catch((e) => toast.error(errorMessage(e, "Could not retry")));
    },
    onReactTo: (messageId: string, emoji: string) => {
      react(id, messageId, emoji).catch((e) => toast.error(errorMessage(e, "Could not react")));
    },
    onVote: votes ? (messageId: MessageId, optionIds: number[]) => votePoll(id, messageId, optionIds) : undefined,
    togglePin: async (message: ChatMessage) => {
      try {
        const isPinned = !message.isPinned;
        await setMessagePinned(id, message.id, isPinned);
        ingestMessage({ ...message, isPinned });
      } catch (error) {
        toast.error(errorMessage(error, "Could not change pinned message"));
      }
    },
  };
}

function chatPeople(chat: Chat, selfId: string, messages: readonly ChatMessage[]): DisplayParticipant[] {
  const members = chatParticipants(chat, selfId);
  const listed = new Set(members.map((member) => member.id));
  const writers = new Set(
    messages.filter((message) => !message.fromMe && !listed.has(message.senderId)).map((message) => message.senderId),
  );
  return [...members, ...[...writers].map((id) => ({ id, protocol: chat.protocol }))];
}

function EmptyTranscript({
  protocol,
  isBot,
  history,
  onRetry,
}: {
  protocol: ProtocolId;
  isBot: boolean;
  history: MessageHistoryState | undefined;
  onRetry(): void;
}) {
  const fetchingHistory = useChatStore((s) => connectionFor(s.protocols, protocol).history.status === "fetching");
  if (history?.loading) return <Skeleton rows={4} lines={1} />;
  if (history?.error) {
    return (
      <View className="p-4">
        <Notice
          tone="danger"
          message="Couldn't load the messages."
          detail={history.error}
          action={{ label: "Retry", onPress: onRetry }}
        />
      </View>
    );
  }
  if (!history && !isBot) return null;
  return (
    <EmptyState
      boot={fetchingHistory ? "fetching history" : "no messages yet"}
      text={
        isBot
          ? "Type /commands to see what you can do in this chat."
          : "Messages are end-to-end encrypted. Type /commands to see what you can do here."
      }
    />
  );
}

function LoadEarlierButton({ history, onPress }: { history: MessageHistoryState; onPress: () => void }) {
  return (
    <View className="items-center px-4 py-3">
      {history.error ? (
        <Notice tone="danger" message={history.error} action={{ label: "Retry", onPress }} />
      ) : (
        <Button variant="ghost" size="sm" label="Load earlier messages" busy={history.loading} onPress={onPress} />
      )}
    </View>
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
  if (chat.consent === "request") {
    return <RequestBar chatId={chat.id} name={title} canBlock={permissions.block} />;
  }
  if (permissions.send) return children;
  if (chat.kind === "channel") return <ChannelMuteBar id={chat.id} />;
  return (
    <View className="mx-4 mb-2">
      <Notice tone="info" message="You can't send messages in this chat." />
    </View>
  );
}

function ChannelMuteBar({ id }: { id: ChatId }) {
  const muted = useChatStore((s) => Boolean(prefsFor(s.chatPrefs, id).muted));
  const setChatPref = useChatStore((s) => s.setChatPref);
  return (
    <View className="mx-4 mb-2">
      <Button
        fullWidth
        icon={muted ? "volume-2" : "volume-x"}
        label={muted ? "Unmute" : "Mute"}
        accessibilityLabel={muted ? "Unmute channel" : "Mute channel"}
        onPress={() => void setChatPref(id, { muted: !muted })}
      />
    </View>
  );
}
