import { invoke } from '@tauri-apps/api/core';

import type { DeviceModelState } from '../../../modules/on-device-ai';
import { fromNative } from './errors';

export type { DeviceModelState };

export const DEVICE_MODEL_NAME = 'Apple Intelligence';
export const DEVICE_TRANSLATION_LABEL = 'Apple Translation · on-device';
export const DEVICE_MODEL_SETTINGS: string | null = 'System Settings › Apple Intelligence & Siri';
export const DEVICE_TRANSLATION_SETTINGS: string | null =
  'System Settings › General › Language & Region › Translation Languages';

export async function deviceModelState(): Promise<DeviceModelState> {
  return invoke<DeviceModelState>('ai_model_state').catch(() => 'unsupported' as const);
}

export async function completeOnDevice(instructions: string, prompt: string): Promise<string> {
  return invoke<string>('ai_complete', { instructions, prompt }).catch((error: unknown) => {
    throw fromNative(error);
  });
}

export async function translateOnDevice(text: string, target: string): Promise<string> {
  return invoke<string>('ai_translate', { text, target }).catch((error: unknown) => {
    throw fromNative(error);
  });
}
