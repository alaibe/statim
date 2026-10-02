export type { DeviceModelState } from '../../../modules/on-device-ai';
export { completeOnDevice, deviceModelState, translateOnDevice } from './native-device';

export const DEVICE_MODEL_NAME = 'Gemini Nano';
export const DEVICE_TRANSLATOR_NAME = 'ML Kit';
export const DEVICE_MODEL_SETTINGS: string | null = null;
/** ML Kit downloads a missing language itself while the phone is online. */
export const DEVICE_TRANSLATION_SETTINGS: string | null = null;
