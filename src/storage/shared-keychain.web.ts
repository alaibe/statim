/** The desktop has no notification extension. */
export async function shareWithExtension(_key: string, _value: string): Promise<void> {}

export async function sharedWithExtension(_key: string): Promise<string | null> {
  return null;
}

export async function unshare(_key: string): Promise<void> {}

export function pushSecretKey(protocol: 'matrix' | 'telegram', accountId: string): string {
  return `push.${protocol}.${accountId}`;
}

export async function forgetPushSecrets(_accountId: string): Promise<void> {}
