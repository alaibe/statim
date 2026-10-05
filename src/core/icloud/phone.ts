/** Only the iPhone listens for the desktop's notes (`phone.ios.ts`). */
export async function hearsFromComputer(_accountId: string): Promise<boolean> {
  return false;
}

export async function listenToComputer(_accountId: string): Promise<void> {}

export async function stopListening(_accountId: string): Promise<void> {}
