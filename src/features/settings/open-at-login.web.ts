import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';

export function opensAtLogin(): Promise<boolean> {
  return isEnabled();
}

export function setOpenAtLogin(on: boolean): Promise<void> {
  return on ? enable() : disable();
}
