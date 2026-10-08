/**
 * The vault's entries as they are stored, under the names they had when the
 * step was written. Protected entries (a recovery phrase behind biometrics)
 * are out of reach: reading one needs the user.
 */
interface VaultEntries {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type VaultStep = (vault: VaultEntries) => Promise<void>;

/**
 * One step per change to what a vault entry holds, oldest first. A step can
 * run again if the app stops halfway through it, so it must leave entries it
 * already moved as they are.
 */
export const VAULT_MIGRATIONS: readonly VaultStep[] = [
  (vault) => vault.remove('notifications.icloudNotes'),
];
