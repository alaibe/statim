export function useEscapeKey(_active: boolean, _onEscape: () => void): void {}

/** Whether a dialog, a sheet or a menu holds Esc; phones have no keys. */
export function overlayOpen(): boolean {
  return false;
}
