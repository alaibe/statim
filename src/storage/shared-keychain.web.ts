/** The desktop has no notification extension. */
export async function shareWithExtension(_key: string, _value: string): Promise<void> {}

export async function unshare(_key: string): Promise<void> {}

export function noteSecretKey(tag: string): string {
  return `icloud.${tag}`;
}
