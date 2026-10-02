export type { DeviceModelState } from '../../../modules/on-device-ai';
export { completeOnDevice, deviceModelState, translateOnDevice } from './native-device';

export const DEVICE_MODEL_NAME = 'Gemini Nano';
/** Google's attribution rules for ML Kit translations ask for these words. */
export const DEVICE_TRANSLATION_LABEL = 'Translated by Google · on-device';
export const TRANSLATE_CHIP_LABEL = 'Translate with Google';
export const DEVICE_MODEL_SETTINGS: string | null = null;
/** ML Kit downloads a missing language itself while the phone is online. */
export const DEVICE_TRANSLATION_SETTINGS: string | null = null;
