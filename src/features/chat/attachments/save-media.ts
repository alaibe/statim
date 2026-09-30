import type { AttachedFile } from '@/core/messaging/attachments';

/** Saving a copy to a folder the user picks is the desktop's (`save-media.web.ts`). */
export const saveMedia: ((file: AttachedFile) => Promise<void>) | undefined = undefined;
