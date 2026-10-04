import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { useChatStore } from '../messaging/chat-store';
import type { ChatSession } from '../messaging/protocol';
import { VaultKey, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';
import { reportError } from './report-error';

let server: string | null = null;
let deviceToken: Promise<string> | null = null;
let watching = false;
/** What each live session was last registered with, so a store change re-registers only what moved. */
const registered = new WeakMap<ChatSession, string>();

export function pushServer(): Promise<string | null> {
  return vaultGet(VaultKey.pushServer);
}

export async function setPushServer(next: string | null): Promise<void> {
  if (next) await vaultSet(VaultKey.pushServer, next);
  else await vaultDelete(VaultKey.pushServer);
  server = next;
  await register();
}

export function watchPush(): void {
  if (watching) return;
  watching = true;
  pushServer()
    .then((saved) => {
      server = saved;
      useChatStore.subscribe(() => void register().catch(reportError));
      return register();
    })
    .catch(reportError);
}

async function register(): Promise<void> {
  const token = server ? await tokenOnce() : null;
  const { sessions, protocols, accountId } = useChatStore.getState();
  const topic = Constants.expoConfig?.ios?.bundleIdentifier;
  for (const [protocol, session] of Object.entries(sessions)) {
    if (!session?.registerPush || protocols[protocol as keyof typeof protocols]?.status !== 'ready')
      continue;
    const target =
      server && token && topic && accountId
        ? { server, deviceToken: token, topic, accountId }
        : null;
    const signature = target ? JSON.stringify(target) : undefined;
    if (registered.get(session) === signature) continue;
    if (signature) registered.set(session, signature);
    else registered.delete(session);
    session.registerPush(target).catch((error: unknown) => {
      registered.delete(session);
      console.warn(`[push] ${protocol} could not register`, error);
    });
  }
}

function tokenOnce(): Promise<string> {
  deviceToken ??= Notifications.getDevicePushTokenAsync().then((token) => String(token.data));
  deviceToken.catch(() => {
    deviceToken = null;
  });
  return deviceToken;
}
