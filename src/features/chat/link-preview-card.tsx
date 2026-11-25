import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { useAppearanceStore } from "@/core/app/appearance";
import type { LinkPreview } from "@/core/messaging/link-preview";
import { Image, Pressable, Radius, Text, useThemeColors } from "@/design";
import { openExternal, openInBrowser } from "@/lib/open-url";
import { PlayOverlay } from "./attachments/video-bubble";
import { useLinkPreview } from "./use-link-preview";

// Fixed, so a short message grows to fit the card instead of the picture spilling out of a text-sized bubble.
const MAX_WIDTH_RATIO = 0.7;
const MAX_WIDTH = 300;
const MAX_IMAGE_HEIGHT = 220;
const DEFAULT_RATIO = 1.91;

export function LinkPreviewCard({ url }: { url: string; fromMe: boolean }) {
  const colors = useThemeColors();
  const enabled = useAppearanceStore((s) => s.linkPreviews);
  const preview = useLinkPreview(enabled ? url : null);
  const { width: screenWidth } = useWindowDimensions();

  if (!preview) return null;

  const { siteName, title, description, image, video } = preview;
  // A video link goes to the system so an installed player app can claim it.
  const open = () => {
    (video ? openExternal(preview.url) : openInBrowser(preview.url)).catch(() => {});
  };

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={[siteName, title].filter(Boolean).join(". ") || url}
      onPress={open}
      className="mt-1.5 flex-row gap-2 py-1.5 pr-2"
      style={{ width: Math.min(screenWidth * MAX_WIDTH_RATIO, MAX_WIDTH) }}
    >
      <View style={{ width: 2, backgroundColor: colors.accent }} />
      <View className="min-w-0 flex-1 gap-0.5">
        {siteName ? (
          <Text variant="label" tone="accent" numberOfLines={1}>
            {siteName}
          </Text>
        ) : null}
        {title ? (
          <Text numberOfLines={3} strong>
            {title}
          </Text>
        ) : null}
        {description ? (
          <Text size="sm" tone="muted" numberOfLines={3}>
            {description}
          </Text>
        ) : null}
        {image ? <PreviewImage key={image.url} image={image} video={video} /> : null}
      </View>
    </Pressable>
  );
}

function PreviewImage({ image, video }: { image: NonNullable<LinkPreview["image"]>; video?: boolean }) {
  const [loaded, setLoaded] = useState<{ width: number; height: number } | null>(null);

  // Declared dimensions win: a poster frame cropped to the site's declared shape loses its letterbox bars.
  const declared = image.width && image.height ? image.width / image.height : null;
  const ratio = declared ?? (loaded ? loaded.width / loaded.height : DEFAULT_RATIO);

  return (
    <View className="mt-1 overflow-hidden" style={{ borderRadius: Radius.md }}>
      <Image
        source={{ uri: image.url }}
        accessibilityIgnoresInvertColors
        style={{ width: "100%", aspectRatio: ratio, maxHeight: MAX_IMAGE_HEIGHT }}
        contentFit="cover"
        transition={120}
        onLoad={({ source }) => setLoaded({ width: source.width, height: source.height })}
      />
      {video ? <PlayOverlay /> : null}
    </View>
  );
}
