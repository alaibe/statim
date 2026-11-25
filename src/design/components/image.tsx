import { Image as ExpoImage, type ImageProps, type ImageSource } from "expo-image";

import { useLoadableUri } from "@/lib/loadable-uri";

/** expo-image, with a local file loaded the way the desktop can show it. */
export function Image({ source, ...props }: ImageProps) {
  const single = isSource(source) ? source : undefined;
  const uri = typeof source === "string" ? source : single?.uri;
  const loaded = useLoadableUri(uri ?? "");
  if (!uri) return <ExpoImage {...props} source={source} />;
  return <ExpoImage {...props} source={loaded ? { ...single, uri: loaded } : null} />;
}

function isSource(source: ImageProps["source"]): source is ImageSource {
  return typeof source === "object" && source !== null && !Array.isArray(source) && "uri" in source;
}
