import { LOCAL_PROTOCOL, namespacedId, protocolChatId } from './namespace';
import type { ChatId, MessageContent } from './types';

const LOCAL_PREFIX = `${LOCAL_PROTOCOL}-`;

export function botChatId(botId: string): ChatId {
  return namespacedId(LOCAL_PROTOCOL, protocolChatId(botId));
}

export function isLocalChat(id: ChatId): boolean {
  return id.startsWith(LOCAL_PREFIX);
}

export function isParticipantId(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value.trim());
}

export function botIdFromChat(id: ChatId): string {
  return id.slice(LOCAL_PREFIX.length);
}

export const STATIM_LOCAL_ID = botChatId('statim');
export const SAVED_LOCAL_ID = botChatId('saved');

export function takesAttachments(id: ChatId): boolean {
  return !isLocalChat(id) || id === STATIM_LOCAL_ID || id === SAVED_LOCAL_ID;
}

export const SAVED_MESSAGES: Bot = {
  id: 'saved',
  name: 'Saved Messages',
  tagline: 'Private notes · on-device',
  greeting: () => [],
};

export interface BotContext {
  chatId: ChatId;
  say(content: MessageContent | string): Promise<void>;
}

export type BotDisposer = void | (() => void);

export interface Bot {
  id: string;
  name: string;
  tagline: string;
  /** A bundled image, as `require` returns it. Without one the chat gets initials. */
  avatar?: number;
  emoji?: string;
  greeting(): (MessageContent | string)[];
  onMessage?(text: string, context: BotContext): Promise<void>;
  activate?(context: BotContext): BotDisposer | Promise<BotDisposer>;
}

export function poll(
  everyMs: number,
  tick: (context: BotContext) => Promise<void>
): (context: BotContext) => () => void {
  return (context) => {
    let stopped = false;

    const run = async () => {
      if (stopped) return;
      try {
        await tick(context);
      } catch (error) {
        console.warn('[bots] poll failed', error);
      }
    };

    void run();
    const timer = setInterval(() => void run(), everyMs);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  };
}

export function toContent(value: MessageContent | string): MessageContent {
  return typeof value === 'string' ? { kind: 'text', text: value } : value;
}
