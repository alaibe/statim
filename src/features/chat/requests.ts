import { errorMessage } from "@/core/errors";
import { useChatStore } from "@/core/messaging/chat-store";
import type { ChatId, ConsentDecision } from "@/core/messaging/types";
import { toast } from "@/design";

export async function answerRequest(chatId: ChatId, consent: ConsentDecision): Promise<void> {
  try {
    await useChatStore.getState().setConsent(chatId, consent);
    toast.success(consent === "accepted" ? "Moved to your chats" : "Request declined");
  } catch (error) {
    toast.error(errorMessage(error, "Could not do that"));
  }
}
