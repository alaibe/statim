/** Only iOS needs a push server to wake it (`push.ios.ts`). */
export async function pushServer(): Promise<string | null> {
  return null;
}

export async function setPushServer(_server: string | null): Promise<void> {}

export function watchPush(): void {}
