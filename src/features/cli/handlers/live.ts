import { useChatStore, type ChatState } from '@/core/messaging/chat-store';
import type { ChatMessage } from '@/core/messaging/types';

import {
  chatLabels,
  displayNames,
  findChat,
  messageJson,
  messageLine,
  visible,
  whenAccountReady,
  type CliHandler,
} from '../context';

/** What an update brought: the chats whose lists or latest message changed, nothing else. */
function changed(state: ChatState, previous: ChatState): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (state.messages !== previous.messages) {
    const before: Readonly<Record<string, readonly ChatMessage[]>> = previous.messages;
    for (const [id, list] of Object.entries(state.messages)) {
      if (list !== before[id]) out.push(...list);
    }
  }
  if (state.chats !== previous.chats) {
    const before = new Map(previous.chats.map((c) => [c.id, c.lastMessage]));
    for (const c of state.chats) {
      if (c.lastMessage && c.lastMessage !== before.get(c.id)) out.push(c.lastMessage);
    }
  }
  return out;
}

/** Older pages loaded while watching are history, not arrivals. */
const HISTORY_SLACK_MS = 60_000;

export const liveHandlers = {
  async watch({ flags }, { io }) {
    await whenAccountReady();
    const only = typeof flags.in === 'string' ? (await findChat(flags.in)).id : undefined;
    const since = Date.now() - HISTORY_SLACK_MS;
    const seen = new Set<string>();
    let printing = Promise.resolve();

    const unsubscribe = useChatStore.subscribe((state, previous) => {
      const fresh = changed(state, previous).filter((m) => {
        if (seen.has(m.id) || m.preview || m.id.startsWith('pending:') || m.status === 'sending')
          return false;
        if (m.sentAt < since || !visible(m) || (only && m.chatId !== only)) return false;
        seen.add(m.id);
        return true;
      });
      if (fresh.length === 0) return;

      printing = printing.then(async () => {
        const chats = new Map(state.chats.map((c) => [c.id, c]));
        const protocols = [...new Set(fresh.flatMap((m) => chats.get(m.chatId)?.protocol ?? []))];
        const [labels, ...names] = await Promise.all([
          chatLabels([...new Set(fresh.flatMap((m) => chats.get(m.chatId) ?? []))]),
          ...protocols.map((p) =>
            displayNames(
              p,
              fresh.filter((m) => chats.get(m.chatId)?.protocol === p).map((m) => m.senderId)
            )
          ),
        ]);
        const senders = Object.assign({}, ...names);
        for (const m of fresh.sort((a, b) => a.sentAt - b.sentAt)) {
          const title = labels.get(m.chatId)?.title;
          io.print(
            io.json
              ? JSON.stringify({ ...messageJson(m, senders), chatTitle: title })
              : `${title ?? m.chatId} › ${messageLine(m, senders)}`
          );
        }
      });
    });

    if (!io.json)
      io.warn(
        only ? `Watching ${only}. Ctrl-C to stop.` : 'Watching for new messages. Ctrl-C to stop.'
      );
    await io.closed;
    unsubscribe();
  },
} satisfies Record<string, CliHandler>;
