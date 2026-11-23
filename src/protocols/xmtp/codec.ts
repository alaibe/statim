import type { ContentTypeId, EncodedContent, JSContentCodec } from "@xmtp/react-native-sdk";

export const PLUGIN_AUTHORITY = "statim.plugin";

interface PluginContentType<T> {
  typeId: string;
  fallback: (content: T) => string;
}

export function createPluginCodec<T>(spec: PluginContentType<T>): JSContentCodec<T> {
  const contentType: ContentTypeId = {
    authorityId: PLUGIN_AUTHORITY,
    typeId: spec.typeId,
    versionMajor: 1,
    versionMinor: 0,
  };

  return {
    contentType,

    encode(content: T): EncodedContent {
      return {
        type: contentType,
        parameters: { encoding: "UTF-8" },
        content: new TextEncoder().encode(JSON.stringify(content)),
      };
    },

    decode(encoded: EncodedContent): T {
      const text = new TextDecoder().decode(
        encoded.content instanceof Uint8Array ? encoded.content : new Uint8Array(encoded.content),
      );
      return JSON.parse(text) as T;
    },

    fallback(content: T) {
      return spec.fallback(content);
    },

    shouldPush() {
      return true;
    },
  };
}
