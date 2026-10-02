export type { DeviceModelState } from '../../../modules/on-device-ai';
export { completeOnDevice, deviceModelState, translateOnDevice } from './native-device';

export const DEVICE_MODEL_NAME = 'Apple Intelligence';
export const DEVICE_TRANSLATION_LABEL = 'Apple Translation · on-device';
export const TRANSLATE_CHIP_LABEL = 'Translate';
export const DEVICE_MODEL_SETTINGS: string | null = 'Settings › Apple Intelligence & Siri';
export const DEVICE_TRANSLATION_SETTINGS: string | null =
  'Settings › Apps › Translate › Downloaded Languages';
