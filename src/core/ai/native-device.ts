import OnDeviceAi, { type DeviceModelState } from '../../../modules/on-device-ai';

import { AiError, fromNative } from './errors';

export async function deviceModelState(): Promise<DeviceModelState> {
  if (!OnDeviceAi) return 'unsupported';
  return OnDeviceAi.modelState().catch(() => 'unsupported' as const);
}

export async function completeOnDevice(
  instructions: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  if (!OnDeviceAi) throw new AiError('unavailable', 'This build has no on-device model.');
  return OnDeviceAi.complete(instructions, prompt, maxTokens).catch((error: unknown) => {
    throw fromNative(error);
  });
}

export async function translateOnDevice(text: string, target: string): Promise<string> {
  if (!OnDeviceAi) throw new AiError('unavailable', 'This build has no on-device translation.');
  return OnDeviceAi.translate(text, target).catch((error: unknown) => {
    throw fromNative(error);
  });
}
