import { toast } from '@/design';
import { errorMessage } from '@/core/errors';
import { useChatStore } from '@/core/messaging/chat-store';
import type { ConsentDecision, ChatId } from '@/core/messaging/types';

export async function answerRequest(chatId: ChatId, consent: ConsentDecision): Promise<void> {
  try {
    await useChatStore.getState().setConsent(chatId, consent);
    toast.success(consent === 'accepted' ? 'Moved to your chats' : 'Request declined');
  } catch (error) {
    toast.error(errorMessage(error, 'Could not do that'));
  }
}
