/** Only Android keeps the app connected once it is closed (`stay-connected.android.ts`). */
export function staysConnected(): boolean {
  return false;
}

export function setStayConnected(_on: boolean): void {}

export function resumeStayingConnected(): void {}
