import type { StickerChoice, StickerContent, StickerPack } from '@/core/messaging/stickers';

import type { TdObject } from './api';
import { download, localFile, localUriOf } from './files';
import { stickerContent } from './mapping';
import type { TelegramHost } from './service-host';
import type { TdSticker } from './types';

interface TdStickers extends TdObject {
  stickers: TdSticker[];
}

interface TdStickerSets extends TdObject {
  sets: { id: string; title: string; covers: TdSticker[] }[];
}

const RECENT = 'recent';
/** Above chat photos and message media: the picker is what you are looking at. */
const PICKER_PRIORITY = 24;

/** Your recent stickers and installed packs, as the picker asks for them. */
export class TelegramStickers {
  private readonly requested = new Set<number>();

  constructor(private readonly host: TelegramHost) {}

  async packs(): Promise<StickerPack[]> {
    const [recent, installed] = await Promise.all([
      this.list(RECENT),
      this.host.api().send<TdStickerSets>({
        '@type': 'getInstalledStickerSets',
        sticker_type: { '@type': 'stickerTypeRegular' },
      }),
    ]);
    const pack = (id: string, title: string, cover?: TdSticker): StickerPack => ({
      id,
      title,
      cover: cover && this.preview(cover),
    });
    return [
      ...(recent.length > 0 ? [pack(RECENT, 'Recent', recent[0])] : []),
      ...installed.sets.map((set) => pack(set.id, set.title, set.covers[0])),
    ];
  }

  async stickers(packId: string): Promise<StickerChoice[]> {
    return (await this.list(packId)).map((sticker) => ({
      id: sticker.id,
      ...(sticker.emoji ? { emoji: sticker.emoji } : {}),
      preview: this.preview(sticker),
    }));
  }

  async content(packId: string, stickerId: string): Promise<StickerContent> {
    const sticker = (await this.list(packId)).find((each) => each.id === stickerId);
    if (!sticker) throw new Error('That sticker is no longer in the pack.');
    return stickerContent(
      sticker,
      await localFile(this.host.api(), sticker.sticker, PICKER_PRIORITY)
    );
  }

  private async list(packId: string): Promise<TdSticker[]> {
    const found = await this.host
      .api()
      .send<TdStickers>(
        packId === RECENT
          ? { '@type': 'getRecentStickers', is_attached: false }
          : { '@type': 'getStickerSet', set_id: packId }
      );
    return found.stickers;
  }

  /** The thumbnail once it is on disk; until then TDLib is asked for it once. */
  private preview(sticker: TdSticker): string | undefined {
    const file = sticker.thumbnail?.file;
    if (!file) return undefined;
    const local = localUriOf(file);
    if (!local && !this.requested.has(file.id)) {
      this.requested.add(file.id);
      download(this.host.api(), file, PICKER_PRIORITY, false).catch(() =>
        this.requested.delete(file.id)
      );
    }
    return local;
  }
}
