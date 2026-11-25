import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/core/errors";
import { useChatStore } from "@/core/messaging/chat-store";
import type { ProtocolId } from "@/core/messaging/namespace";
import type { PublicChatPreview } from "@/core/messaging/protocol";
import type { PublicChatsCopy } from "@/core/messaging/registry";
import { Avatar, Button, FieldError, Input, Section, Text } from "@/design";
import { openChatFromSheet } from "@/features/navigation/open";

export function JoinPublicChat({ protocol, copy }: { protocol: ProtocolId; copy: PublicChatsCopy }) {
  const previewPublicChat = useChatStore((s) => s.previewPublicChat);
  const joinPublicChat = useChatStore((s) => s.joinPublicChat);
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<PublicChatPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewPublicChat(protocol, input));
    } catch (failure) {
      setError(errorMessage(failure, "Couldn’t preview that chat. Check the link or the name."));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const chat = await joinPublicChat(protocol, preview.id);
      if (chat) openChatFromSheet(chat.id);
      else {
        setRequestSent(true);
        setPreview(null);
      }
    } catch (failure) {
      setError(errorMessage(failure, "Couldn’t join that chat"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2">
      <Text variant="label">{copy.title}</Text>
      <Text size="sm" tone="muted">
        {copy.hint}
      </Text>
      <View className="flex-row items-end gap-2">
        <View className="flex-1">
          <Input
            label="Group or channel"
            placeholder={copy.placeholder}
            value={input}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              setInput(value);
              setPreview(null);
              setError(null);
              setRequestSent(false);
            }}
            onSubmitEditing={() => void lookup()}
          />
        </View>
        <Button label="Preview" disabled={!input.trim() || busy} busy={busy && !preview} onPress={lookup} />
      </View>
      {preview ? (
        <Section raised>
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <Avatar label={preview.title} size={40} image={preview.avatarUri} />
              <View className="min-w-0 flex-1">
                <Text strong numberOfLines={1}>
                  {preview.title}
                </Text>
                <Text variant="meta">
                  {preview.kind === "channel" ? "Channel" : "Group"}
                  {preview.memberCount
                    ? ` · ${preview.memberCount} ${preview.kind === "channel" ? "subscribers" : "members"}`
                    : ""}
                </Text>
              </View>
            </View>
            {preview.description ? <Text tone="muted">{preview.description}</Text> : null}
            <Button
              label={preview.joined ? "Open chat" : preview.requiresApproval ? "Request to join" : "Join chat"}
              busy={busy}
              disabled={Boolean(preview.joinUnavailableReason)}
              onPress={join}
            />
            {preview.joinUnavailableReason ? (
              <Text size="sm" tone="muted">
                {preview.joinUnavailableReason}
              </Text>
            ) : null}
          </View>
        </Section>
      ) : null}
      {requestSent ? (
        <Text size="sm" tone="muted">
          Sent a join request. An administrator needs to approve it.
        </Text>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}
