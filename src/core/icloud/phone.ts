/** Only the iPhone listens for the desktop's notes (`phone.ios.ts`). */
export type ListeningState = 'unavailable' | 'off' | 'on';

export async function listeningState(_accountId: string): Promise<ListeningState> {
  return 'unavailable';
}

export async function listenToComputer(_accountId: string): Promise<void> {}

export async function stopListening(_accountId: string): Promise<void> {}
