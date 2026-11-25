import { FlashList } from "@shopify/flash-list";
import { clearSharedPayloads, getSharedPayloads, type SharePayload } from "expo-sharing";
import { useState } from "react";
import { useAccountStore } from "@/core/account/account-store";
import { errorMessage } from "@/core/errors";
import { sessionFor, useChatStore } from "@/core/messaging/chat-store";
import { draftKey } from "@/core/messaging/drafts";
import { chatPermissions } from "@/core/messaging/permissions";
import type { Chat } from "@/core/messaging/types";
import { EmptyState, IconButton, PhoneHeader, Row, Screen, Skeleton, toast } from "@/design";
import { openChatFromSheet } from "@/features/navigation/open";
import { useBack } from "@/features/navigation/use-back";

import { contentFromShare, deleteSharedFiles, isSharedText, sharedText } from "./attachments/shared-content";
import { ChatAvatar } from "./chat-avatar";
import { useChatTitles } from "./use-display-names";

export function ShareScreen() {
  const goBack = useBack("/");
  const status = useAccountStore((s) => s.status);
  const [shared] = useState(getSharedPayloads);
  const text = sharedText(shared);
  const files = shared.filter((p) => !isSharedText(p));

  const close = () => {
    clearSharedPayloads();
    deleteSharedFiles(files);
    goBack();
  };

  return (
    <Screen edges={["bottom"]}>
      <PhoneHeader title="Send to" action={<IconButton icon="x" label="Close" onPress={close} />} />
      {status === "loading" ? (
        <Skeleton avatar lines={1} />
      ) : status !== "ready" ? (
        <EmptyState boot="no account yet" text="Create or import an account in Statim, then share again." />
      ) : !text && files.length === 0 ? (
        <EmptyState boot="nothing to send" noMatch />
      ) : (
        <ChatPicker
          photos={files.some((p) => p.shareType === "image")}
          onPick={(chat) => {
            clearSharedPayloads();
            if (text) appendToDraft(chat, text);
            openChatFromSheet(chat.id);
            if (files.length > 0) void sendFiles(chat, files);
          }}
        />
      )}
    </Screen>
  );
}

function ChatPicker({ photos, onPick }: { photos: boolean; onPick: (chat: Chat) => void }) {
  const chats = useChatStore((s) => s.chats);
  const sessions = useChatStore((s) => s.sessions);
  const { titleOf, selfIdOf } = useChatTitles(chats);
  const takesShare = (chat: Chat) => {
    const can = chatPermissions(chat, sessionFor({ sessions }, chat.id));
    return photos ? can.sendImages : can.attach;
  };

  return (
    <FlashList
      data={chats.filter(takesShare)}
      keyExtractor={(c) => c.id}
      ListEmptyComponent={<EmptyState boot="no chat fits" noMatch />}
      renderItem={({ item }) => (
        <Row
          testID={`share-to-${item.id}`}
          title={titleOf(item)}
          leading={<ChatAvatar chat={item} selfId={selfIdOf(item)} size={28} />}
          onPress={() => onPick(item)}
        />
      )}
    />
  );
}

function appendToDraft(chat: Chat, text: string) {
  const { drafts, setDraft } = useChatStore.getState();
  const draft = drafts[draftKey(chat.id)];
  setDraft(chat.id, draft ? `${draft}\n${text}` : text);
}

async function sendFiles(chat: Chat, files: SharePayload[]) {
  const { sendMessage, sessions } = useChatStore.getState();
  const can = chatPermissions(chat, sessionFor({ sessions }, chat.id));
  try {
    for (const file of files) {
      await sendMessage(chat.id, await contentFromShare(file, can));
    }
  } catch (e) {
    toast.error(errorMessage(e, "Could not send that"));
  } finally {
    deleteSharedFiles(files);
  }
}
