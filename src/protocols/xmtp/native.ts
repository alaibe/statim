import { requireNativeModule } from 'expo-modules-core';

/** The SDK's own native module, for what `patches/@xmtp+react-native-sdk+5.7.0.patch` adds to it. */
export const xmtpNative = requireNativeModule<{
  getLastReadTimes(installationId: string, conversationId: string): Promise<Record<string, number>>;
}>('XMTP');
