import { useEffect, useState } from 'react';

import { useAccountStore } from '@/core/account/account-store';
import { useChatStore } from '@/core/messaging/chat-store';
import type { StickerChoice, StickerContent } from '@/core/messaging/stickers';
import type { ChatId } from '@/core/messaging/types';
import { useKeyedLoad } from '@/lib/use-keyed-load';

import { statimPacks } from './attachments/statim-stickers';
import { useSupports } from './use-supports';

const RETRY_MS = 700;
const RETRIES = 15;

/** A pack in the picker, whichever source it comes from. */
export interface PickerPack {
  key: string;
  title: string;
  cover?: string;
  stickers(): Promise<StickerChoice[]>;
  content(stickerId: string): Promise<StickerContent>;
}

/** The chat's network's own packs, then Statim's, each source failing on its own. */
export function useStickerPacks(chatId: ChatId) {
  const { supports } = useSupports(chatId);
  const accountId = useAccountStore((s) => s.activeAccountId);
  const stickerPacks = useChatStore((s) => s.stickerPacks);
  const stickers = useChatStore((s) => s.stickers);
  const stickerContent = useChatStore((s) => s.stickerContent);

  const loadNetwork = async (id: ChatId): Promise<PickerPack[]> =>
    (await stickerPacks(id)).map((pack) => ({
      key: `network:${pack.id}`,
      title: pack.title,
      cover: pack.cover,
      stickers: () => stickers(id, pack.id),
      content: (stickerId) => stickerContent(id, pack.id, stickerId),
    }));
  const network = useLoadUntil(supports('stickerPacks') ? chatId : null, loadNetwork, (packs) =>
    packs.every((pack) => pack.cover)
  );
  const statim = useKeyedLoad(accountId, statimPacks);
  const packs = [...(network.value ?? []), ...(statim.value ?? [])];
  return {
    packs: network.loading || (packs.length === 0 && statim.loading) ? undefined : packs,
    error: packs.length === 0 ? (network.error ?? statim.error) : undefined,
  };
}

/** Loads again every so often until `done`, for pictures still downloading, then gives up. */
export function useLoadUntil<T, K extends string>(
  key: K | null,
  load: (key: K) => Promise<T>,
  done: (value: T) => boolean
) {
  const [retry, setRetry] = useState({ key, round: 0 });
  const round = retry.key === key ? retry.round : 0;
  const loaded = useKeyedLoad(key, load, round);
  const waiting = loaded.value !== undefined && !done(loaded.value) && round < RETRIES;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setRetry({ key, round: round + 1 }), RETRY_MS);
    return () => clearTimeout(timer);
  }, [waiting, key, round]);
  return loaded;
}
