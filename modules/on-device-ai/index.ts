import { requireOptionalNativeModule } from 'expo-modules-core';

export type DeviceModelState = 'ready' | 'off' | 'downloading' | 'unsupported';

interface OnDeviceAiModule {
  modelState(): Promise<DeviceModelState>;
  complete(instructions: string, prompt: string): Promise<string>;
  /** `target` is a BCP 47 language tag. Rejects with ERR_LANGUAGE_MISSING when its pack is not downloaded. */
  translate(text: string, target: string): Promise<string>;
}

export default requireOptionalNativeModule<OnDeviceAiModule>('OnDeviceAi');
