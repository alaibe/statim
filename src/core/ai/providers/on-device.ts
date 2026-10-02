import {
  completeOnDevice,
  DEVICE_MODEL_NAME,
  DEVICE_MODEL_SETTINGS,
  type DeviceModelState,
} from '../device';
import type { AiProvider } from './interface';

/** Apple's on-device window is 4,096 tokens for instructions, input and answer together. */
export const DEVICE_MAX_INPUT_CHARS = 6_000;
const SETUP = 'Set up a model in Settings › AI.';

export const deviceProvider: AiProvider = {
  label: `${DEVICE_MODEL_NAME} · on-device`,
  onDevice: true,
  maxInputChars: DEVICE_MAX_INPUT_CHARS,
  complete: ({ instructions, prompt }) => completeOnDevice(instructions, prompt),
};

export function deviceUnavailableReason(state: Exclude<DeviceModelState, 'ready'>): string {
  switch (state) {
    case 'off':
      return DEVICE_MODEL_SETTINGS
        ? `${DEVICE_MODEL_NAME} is off. Turn it on in ${DEVICE_MODEL_SETTINGS}, or set up another model in Settings › AI.`
        : `${DEVICE_MODEL_NAME} is not ready on this device. ${SETUP}`;
    case 'downloading':
      return `${DEVICE_MODEL_NAME} is still downloading. Try again in a few minutes, or set up another model in Settings › AI.`;
    case 'unsupported':
      return `This device has no AI model of its own. ${SETUP}`;
  }
}
