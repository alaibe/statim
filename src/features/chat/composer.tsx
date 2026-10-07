import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { completeCommandName } from '@/core/commands/parser';
import {
  ActionSheet,
  Enter,
  ErrorText,
  Exit,
  Icon,
  IconButton,
  Pressable,
  type SheetAction,
  springLayout,
  Text,
  useThemeColors,
} from '@/design';
import { chatScope } from '@/core/messaging/chat-scope';
import { useChatStore } from '@/core/messaging/chat-store';
import { draftKey } from '@/core/messaging/drafts';
import type { ChatId, ChatKind, MessageContent, MessageId } from '@/core/messaging/types';
import { usePluginHost } from '@/core/plugins/host';
import { errorMessage } from '@/core/errors';

import { MediaPanel, type MediaAnchor } from './media-panel';
import type { MediaTab } from './media-panel-content';
import {
  contentFromBrowserFile,
  pickFile,
  pickImage,
  pickVideo,
  takePhoto,
} from './attachments/pick';
import { VoiceRecorder } from './attachments/voice-recorder';
import { ModeBanner } from './mode-banner';
import { QuickActions } from './quick-actions';
import { commandSuggestions } from './command-suggestions';
import { ComposerInput, type ComposerInputHandle } from './composer-input';
import type { ComposerBanner } from './composer-mode';
import { SuggestionPopover } from './suggestion-popover';
import { useCommandDispatch } from './use-command-dispatch';
import { useMentionSuggestions } from './use-mention-suggestions';
import { useChatPermissions } from './use-chat-permissions';
import { withFinalEmoji } from './typed-emoji';
import { useTypingAnnouncer } from './use-typing-announcer';

interface ComposerProps {
  chatId: ChatId;
  kind: ChatKind;
  /** Writes into this thread, with a draft of its own. */
  thread?: MessageId;
  onSendText(text: string): Promise<string>;
  onSendContent(content: MessageContent): Promise<void>;
  /** Editing hides attachments and mentions: only the text of a message can change. */
  editing?: boolean;
  banner?: ComposerBanner | null;
  onCancelBanner(): void;
  pendingCommand: string | null;
  onRunningChange(label: string | null): void;
  onPendingCommandHandled(): void;
}

export function Composer({
  chatId,
  kind,
  thread,
  onSendText,
  onSendContent,
  editing = false,
  banner,
  onCancelBanner,
  pendingCommand,
  onRunningChange,
  onPendingCommandHandled,
}: ComposerProps) {
  const colors = useThemeColors();
  const inputRef = useRef<ComposerInputHandle>(null);
  const { registry } = usePluginHost();
  const can = useChatPermissions(chatId);

  const value = useChatStore((s) => s.drafts[draftKey(chatId, thread)] ?? '');
  const setDraftFor = useChatStore((s) => s.setDraft);
  const setValue = useCallback(
    (text: string) => setDraftFor(chatId, text, thread),
    [chatId, thread, setDraftFor]
  );

  const scope = chatScope(chatId, kind);
  const { commands, dispatch, busy, error, setError } = useCommandDispatch({
    chatId,
    scope,
    onSendText,
    setDraft: setValue,
    onRunningChange,
    pendingCommand,
    onPendingCommandHandled,
  });
  const announceTyping = useTypingAnnouncer(chatId, can.announceTyping);
  const mentions = useMentionSuggestions(chatId, value, !editing && can.mention);

  const [attaching, setAttaching] = useState(false);
  const [media, setMedia] = useState<{ tab: MediaTab; anchor: MediaAnchor | null } | null>(null);
  const emojiButton = useRef<View>(null);
  const openMedia = (tab: MediaTab) => {
    const button = emojiButton.current;
    if (!button) return setMedia({ tab, anchor: null });
    button.measureInWindow((x, y, width, height) =>
      setMedia({ tab, anchor: { x, y, width, height } })
    );
  };

  const canAttach = !editing && can.attach;
  const carriesImages = !editing && can.sendImages;
  const mediaTabs: MediaTab[] = carriesImages ? ['emoji', 'stickers', 'gifs'] : ['emoji'];

  const sendContent = (content: MessageContent) => {
    onSendContent(content).catch((e) => setError(errorMessage(e, 'Could not send that')));
  };
  const closeMedia = () => {
    setMedia(null);
    // After the modal has unmounted, or its focus trap puts the focus back on the button.
    if (process.env.EXPO_OS === 'web') setTimeout(() => inputRef.current?.focus(), 0);
  };

  const attach = async (pick: () => Promise<MessageContent | null>) => {
    try {
      const content = await pick();
      if (content) await onSendContent(content);
    } catch (e) {
      setError(errorMessage(e, 'Could not attach that'));
    }
  };

  const { suggestions, commandNames } = commandSuggestions(value, commands);

  const fill = (text: string) => {
    setValue(text);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (busy) return;
    return dispatch(withFinalEmoji(value));
  };

  useEffect(() => {
    if (process.env.EXPO_OS === 'web') inputRef.current?.focus();
  }, [chatId, thread]);

  const canSend = value.trim().length > 0 && !busy;

  return (
    <View>
      <SuggestionPopover
        items={mentions.matches}
        keyOf={(person) => person.id}
        labelOf={(person) => `Mention ${person.name}`}
        onPick={(person) => fill(mentions.apply(person))}
        render={(person) => (
          <>
            <Text className="flex-1 font-semibold">{person.name}</Text>
            <Text variant="caption">{person.address}</Text>
          </>
        )}
      />
      <SuggestionPopover
        testID="command-suggestions"
        items={suggestions}
        keyOf={({ command }) => command.name}
        itemTestID={({ command }) => `command-${command.name}`}
        onPick={({ command }) => fill(`/${command.name} `)}
        render={({ command, pluginId }) => (
          <>
            <Text className="font-mono text-footnote font-semibold text-brand">
              /{command.name}
            </Text>
            <Text variant="caption" numberOfLines={1} className="flex-1">
              {command.description}
            </Text>
            <Text variant="micro">{registry.get(pluginId)?.manifest.name ?? ''}</Text>
          </>
        )}
      />

      {error ? (
        <Animated.View entering={Enter.fade()} exiting={Exit.fade()} className="mx-gutter mb-1.5">
          <ErrorText>{error}</ErrorText>
        </Animated.View>
      ) : null}

      <QuickActions
        chatId={chatId}
        scope={scope}
        hasDraft={value.trim() !== ''}
        onRun={(action) => {
          const draft = useChatStore.getState().drafts[draftKey(chatId, thread)]?.trim();
          void dispatch(
            action.takesDraft ? `${action.command} ${draft}` : action.command,
            'action'
          );
        }}
      />

      {banner ? <ModeBanner banner={banner} editing={editing} onCancel={onCancelBanner} /> : null}

      <Animated.View layout={springLayout()} className="flex-row items-end gap-2 px-3 pb-2 pt-1">
        {canAttach ? (
          <IconButton
            testID="composer-attach"
            icon="attach-outline"
            label="Attach"
            surface="outline"
            size={20}
            onPress={() => setAttaching(true)}
          />
        ) : null}

        <View className="min-h-[44px] flex-1 flex-row items-end rounded-pill border border-line bg-surface-raised pl-4 pr-1">
          <ComposerInput
            ref={inputRef}
            value={value}
            onChangeText={(text) => {
              announceTyping(text);
              if (error) setError(null);
              const typed = text.replace(/\t/g, '');
              setValue(typed === text ? text : (completeCommandName(typed, commandNames) ?? typed));
            }}
            onSubmit={() => void submit()}
            onFile={
              canAttach
                ? (file) => void attach(() => contentFromBrowserFile(file, can.sendVideo))
                : undefined
            }
            placeholder={thread ? 'Reply in thread' : 'Message'}
            placeholderColor={colors['content-subtle']}
          />

          <View ref={emojiButton} collapsable={false}>
            <Pressable
              testID="composer-emoji"
              accessibilityRole="button"
              accessibilityLabel="Emoji"
              onPress={() => openMedia('emoji')}
              className="h-11 w-9 items-center justify-center">
              <Icon name="happy-outline" size={21} tone="muted" />
            </Pressable>
          </View>
        </View>

        {canAttach && value.trim().length === 0 && !busy ? (
          <VoiceRecorder onRecorded={sendContent} onError={setError} />
        ) : (
          <IconButton
            testID="composer-send"
            icon={busy ? 'ellipsis-horizontal' : 'arrow-up'}
            label="Send"
            surface={canSend ? 'brand' : 'outline'}
            tone={canSend ? 'brand-on' : 'subtle'}
            size={20}
            disabled={!canSend}
            onPress={() => void submit()}
          />
        )}
      </Animated.View>

      {media ? (
        <MediaPanel
          chatId={chatId}
          tabs={mediaTabs}
          tab={media.tab}
          anchor={media.anchor}
          onClose={closeMedia}
          onEmoji={(picked) => setValue(value + picked)}
          onSend={(content) => {
            closeMedia();
            sendContent(content);
          }}
        />
      ) : null}

      <AttachSheet
        visible={attaching}
        onClose={() => setAttaching(false)}
        carriesImages={carriesImages}
        sendsVideo={can.sendVideo}
        onAttach={(pick) => void attach(pick)}
        onGifs={() => openMedia('gifs')}
      />
    </View>
  );
}

function AttachSheet({
  visible,
  onClose,
  carriesImages,
  sendsVideo,
  onAttach,
  onGifs,
}: {
  visible: boolean;
  onClose: () => void;
  carriesImages: boolean;
  sendsVideo: boolean;
  onAttach: (pick: () => Promise<MessageContent | null>) => void;
  onGifs: () => void;
}) {
  const actions: SheetAction[] = [];
  if (carriesImages) {
    actions.push({
      label: 'Photo library',
      icon: 'images-outline',
      onPress: () => onAttach(pickImage),
    });
  }
  if (sendsVideo) {
    actions.push({ label: 'Video', icon: 'videocam-outline', onPress: () => onAttach(pickVideo) });
  }
  if (carriesImages) {
    actions.push({
      label: 'Take a photo',
      icon: 'camera-outline',
      onPress: () => onAttach(takePhoto),
    });
  }
  actions.push({ label: 'File', icon: 'document-outline', onPress: () => onAttach(pickFile) });
  if (carriesImages) actions.push({ label: 'GIF', icon: 'happy-outline', onPress: onGifs });
  return <ActionSheet visible={visible} onClose={onClose} title="Attach" actions={actions} />;
}
