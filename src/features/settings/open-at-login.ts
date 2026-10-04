/** Only the desktop opens at login (`open-at-login.web.ts`). */
export async function opensAtLogin(): Promise<boolean> {
  return false;
}

export async function setOpenAtLogin(_on: boolean): Promise<void> {}
