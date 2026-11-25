import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";

import { SUGGESTED_ACTION_IDS } from "@/core/commands/ai";
import { completeCommandName } from "@/core/commands/parser";
import { errorMessage } from "@/core/errors";
import { chatScope } from "@/core/messaging/chat-scope";
import { useChatStore } from "@/core/messaging/chat-store";
import { draftKey } from "@/core/messaging/drafts";
import type { ChatId, ChatKind, MessageContent, MessageId } from "@/core/messaging/types";
import { usePluginHost } from "@/core/plugins/host";
import {
  Button,
  controlHeight,
  Enter,
  Exit,
  FieldError,
  IconButton,
  Menu,
  type MenuItem,
  Radius,
  springLayout,
  Text,
  useThemeColors,
} from "@/design";
import {
  type AttachLimits,
  contentFromBrowserFile,
  pickFile,
  pickImage,
  pickVideo,
  takePhoto,
} from "./attachments/pick";
import { VoiceRecorder } from "./attachments/voice-recorder";
import { commandSuggestions } from "./command-suggestions";
import { ComposerInput, type ComposerInputHandle } from "./composer-input";
import type { ComposerBanner } from "./composer-mode";
import { type MediaAnchor, MediaPanel } from "./media-panel";
import type { MediaTab } from "./media-panel-content";
import { ModeBanner } from "./mode-banner";
import { QuickActions } from "./quick-actions";
import { SuggestionPopover } from "./suggestion-popover";
import { withFinalEmoji } from "./typed-emoji";
import { useChatPermissions } from "./use-chat-permissions";
import { useCommandDispatch } from "./use-command-dispatch";
import { useMentionSuggestions } from "./use-mention-suggestions";
import { useReplySuggestion } from "./use-reply-suggestion";
import { useSuggestedAction } from "./use-suggested-action";
import { useTypingAnnouncer } from "./use-typing-announcer";

interface ComposerProps {
  chatId: ChatId;
  kind: ChatKind;
  thread?: MessageId;
  onSendText(text: string): Promise<string>;
  onSendContent(content: MessageContent): Promise<void>;
  /** Editing hides attachments and mentions: only the text of a message can change. */
  editing?: boolean;
  onEditLast?(): void;
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
  onEditLast,
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

  const value = useChatStore((s) => s.drafts[draftKey(chatId, thread)] ?? "");
  const setDraftFor = useChatStore((s) => s.setDraft);
  const setValue = useCallback((text: string) => setDraftFor(chatId, text, thread), [chatId, thread, setDraftFor]);

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
    button.measureInWindow((x, y, width, height) => setMedia({ tab, anchor: { x, y, width, height } }));
  };

  const canAttach = !editing && can.attach;
  const carriesImages = !editing && can.sendImages;
  const mediaTabs: MediaTab[] = carriesImages ? ["emoji", "stickers", "gifs"] : ["emoji"];

  const sendContent = (content: MessageContent) => {
    onSendContent(content).catch((e) => setError(errorMessage(e, "Could not send that")));
  };
  const closeMedia = () => {
    setMedia(null);
    // After the modal has unmounted, or its focus trap puts the focus back on the button.
    if (process.env.EXPO_OS === "web") setTimeout(() => inputRef.current?.focus(), 0);
  };

  const attach = async (pick: () => Promise<MessageContent | null>) => {
    try {
      const content = await pick();
      if (content) await onSendContent(content);
    } catch (e) {
      setError(errorMessage(e, "Could not attach that"));
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
    if (process.env.EXPO_OS === "web") inputRef.current?.focus();
  }, [chatId, thread]);

  const canSend = value.trim().length > 0 && !busy;
  const assists = !thread && (scope === "dm" || scope === "group");
  const idle = !busy && !banner;
  const suggested = useSuggestedAction(chatId, assists && idle && !value.trim());
  const reply = useReplySuggestion(chatId, assists && idle);
  const ghost = reply.suggestion;
  const ready = ghost?.status === "ready" ? ghost : null;
  const takeReply = () => {
    if (!ready) return;
    fill(ready.text);
    reply.dismiss();
  };
  const ghostText = ready?.text ?? (ghost?.status === "pending" ? `Preparing a ${reply.kind}…` : null);
  const shownError = error ?? (ghost?.status === "error" ? ghost.text : null);

  return (
    <View>
      <SuggestionPopover
        items={mentions.matches}
        keyOf={(person) => person.id}
        labelOf={(person) => `Mention ${person.name}`}
        onPick={(person) => fill(mentions.apply(person))}
        render={(person) => (
          <>
            <Text className="flex-1" strong>
              {person.name}
            </Text>
            <Text variant="meta">{person.address}</Text>
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
            <Text variant="control" tone="accent">
              /{command.name}
            </Text>
            <Text size="sm" tone="muted" numberOfLines={1} className="flex-1">
              {command.description}
            </Text>
            <Text variant="meta">{registry.get(pluginId)?.manifest.name ?? ""}</Text>
          </>
        )}
      />

      {shownError ? (
        <Animated.View entering={Enter.fade()} exiting={Exit.fade()} className="mx-4 mb-1.5">
          <FieldError>{shownError}</FieldError>
        </Animated.View>
      ) : null}

      <QuickActions
        chatId={chatId}
        scope={scope}
        hasDraft={value.trim() !== ""}
        suggestedId={suggested ? SUGGESTED_ACTION_IDS[suggested] : undefined}
        onRun={(action) => {
          const draft = useChatStore.getState().drafts[draftKey(chatId, thread)]?.trim();
          void dispatch(action.takesDraft ? `${action.command} ${draft}` : action.command, "action");
        }}
      />

      {banner ? <ModeBanner banner={banner} editing={editing} onCancel={onCancelBanner} /> : null}

      <Animated.View layout={springLayout()} className="flex-row items-end gap-2 px-3 pb-2 pt-1">
        {canAttach ? (
          <IconButton testID="composer-attach" icon="paperclip" label="Attach…" onPress={() => setAttaching(true)} />
        ) : null}

        <View
          className="flex-1 flex-row items-end pl-3 pr-1"
          style={{
            minHeight: controlHeight(),
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: ghostText ? colors.accent : colors["line-strong"],
            backgroundColor: colors.panel,
          }}
        >
          <ComposerInput
            ref={inputRef}
            value={value}
            onChangeText={(text) => {
              announceTyping(text);
              if (error) setError(null);
              const typed = text.replace(/\t/g, "");
              if (typed !== text && typed === "" && ready) return takeReply();
              setValue(typed === text ? text : (completeCommandName(typed, commandNames) ?? typed));
            }}
            onSubmit={() => void submit()}
            onFile={canAttach ? (file) => void attach(() => contentFromBrowserFile(file, can)) : undefined}
            onEditLast={value === "" && !busy && !editing ? onEditLast : undefined}
            placeholder={ghostText ?? (thread ? "Reply in thread" : "Message")}
            placeholderColor={ghostText ? colors.accent : colors.muted}
          />

          {ready ? (
            <IconButton
              testID="ai-use-reply"
              icon="sparkles"
              label={`Use suggested ${reply.kind}, by ${ready.label}`}
              tone="accent"
              size="sm"
              onPress={takeReply}
            />
          ) : null}

          <View ref={emojiButton} collapsable={false}>
            <IconButton
              testID="composer-emoji"
              icon="smile"
              label="Emoji"
              size="sm"
              onPress={() => openMedia("emoji")}
            />
          </View>
        </View>

        {canAttach && value.trim().length === 0 && !busy ? (
          <VoiceRecorder onRecorded={sendContent} onError={setError} />
        ) : (
          <Button
            testID="composer-send"
            variant="primary"
            label="Send"
            busy={busy}
            disabled={!canSend && !busy}
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
        onAttach={(pick) => void attach(() => pick(can))}
        onGifs={() => openMedia("gifs")}
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
  onAttach: (pick: (can: AttachLimits) => Promise<MessageContent | null>) => void;
  onGifs: () => void;
}) {
  const items: MenuItem[] = [];
  if (carriesImages) {
    items.push({
      label: "Photo library",
      icon: "images",
      onPress: () => onAttach(pickImage),
    });
  }
  if (sendsVideo) {
    items.push({ label: "Video", icon: "video", onPress: () => onAttach(pickVideo) });
  }
  if (carriesImages) {
    items.push({
      label: "Take a photo",
      icon: "camera",
      onPress: () => onAttach(takePhoto),
    });
  }
  items.push({ label: "File", icon: "file", onPress: () => onAttach(pickFile) });
  if (carriesImages) items.push({ label: "GIF", icon: "smile", onPress: onGifs });
  return <Menu visible={visible} onClose={onClose} title="Attach" items={items} />;
}
