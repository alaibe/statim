import type { MessageContent } from '@/core/messaging/types';

export type SavableMedia = Extract<MessageContent, { kind: 'image' | 'video' | 'file' }>;

/** Saving a copy to a folder the user picks is the desktop's (`save-media.web.ts`). */
export const saveMedia: ((media: SavableMedia) => Promise<void>) | undefined = undefined;
