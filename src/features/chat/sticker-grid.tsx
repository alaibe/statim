import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ErrorText, Loading, Pressable, Text } from '@/design';
import { errorMessage } from '@/core/errors';
import { stickerLabel } from '@/core/messaging/preview';
import type { ChatId, MessageContent } from '@/core/messaging/types';

import { StickerEmoji } from './attachments/sticker-bubble';
import { type PickerPack, useLoadUntil, useStickerPacks } from './use-sticker-packs';

const COLUMNS = 4;
const GAP = 6;
const COVER = 32;

interface GridProps {
  width: number;
  onSend(content: MessageContent): void;
}

export function StickerGrid({ chatId, ...grid }: GridProps & { chatId: ChatId }) {
  const { packs, error } = useStickerPacks(chatId);

  if (error) {
    return (
      <ErrorText className="px-4 py-4">
        {errorMessage(error, 'Could not load the stickers')}
      </ErrorText>
    );
  }
  if (!packs) return <Loading className="flex-1 py-8" />;
  if (packs.length === 0) {
    return (
      <Text variant="footnote" className="px-4 py-4">
        No sticker packs yet.
      </Text>
    );
  }
  return <Packs packs={packs} {...grid} />;
}

function Packs({ packs, width, onSend }: GridProps & { packs: PickerPack[] }) {
  const [chosen, setChosen] = useState<string>();
  const pack = packs.find((each) => each.key === chosen) ?? packs[0];
  const choices = useLoadUntil(
    pack.key,
    () => pack.stickers(),
    (loaded) => loaded.every((choice) => choice.preview)
  );
  const [error, setError] = useState<string | null>(null);

  const tile = Math.floor((width - 24 - GAP * (COLUMNS - 1)) / COLUMNS);
  const send = async (stickerId: string) => {
    setError(null);
    try {
      onSend(await pack.content(stickerId));
    } catch (e) {
      setError(errorMessage(e, 'Could not send that sticker'));
    }
  };

  return (
    <View className="flex-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="shrink-0 grow-0 border-b border-line"
        contentContainerClassName="gap-1 px-3 py-2">
        {packs.map((each) => (
          <Pressable
            key={each.key}
            accessibilityRole="tab"
            accessibilityLabel={each.title}
            accessibilityState={{ selected: each === pack }}
            onPress={() => setChosen(each.key)}
            className={each === pack ? 'rounded-md bg-surface-sunken p-1' : 'rounded-md p-1'}>
            {each.cover ? (
              <Image
                source={{ uri: each.cover }}
                style={{ width: COVER, height: COVER }}
                contentFit="contain"
              />
            ) : (
              <View style={{ width: COVER, height: COVER }} className="items-center justify-center">
                <Text variant="caption">{each.title.slice(0, 1)}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      <ErrorText className="px-4 pt-2">
        {error ?? (choices.error ? errorMessage(choices.error, 'Could not open that pack') : null)}
      </ErrorText>

      {choices.loading ? (
        <Loading className="flex-1 py-8" />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-row flex-wrap px-3 py-2"
          contentContainerStyle={{ gap: GAP }}>
          {(choices.value ?? []).map((sticker) => (
            <Pressable
              key={sticker.id}
              accessibilityRole="button"
              accessibilityLabel={stickerLabel(sticker.emoji)}
              onPress={() => void send(sticker.id)}>
              {sticker.preview ? (
                <Image
                  source={{ uri: sticker.preview }}
                  recyclingKey={sticker.preview}
                  style={{ width: tile, height: tile }}
                  contentFit="contain"
                />
              ) : (
                <StickerEmoji emoji={sticker.emoji} box={{ width: tile, height: tile }} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
