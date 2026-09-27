import { Redirect, useLocalSearchParams } from 'expo-router';

import { parseChatId } from '@/core/messaging/namespace';
import { ChatView } from '@/features/chat/chat-view';
import { useBack } from '@/features/navigation/use-back';

export default function ThreadScreen() {
  const params = useLocalSearchParams<{ id: string; root: string }>();
  const back = useBack(`/chat/${params.id}`);
  const id = parseChatId(params.id);
  if (!id) return <Redirect href="/chats" />;
  return <ChatView id={id} thread={params.root} onBack={back} />;
}
