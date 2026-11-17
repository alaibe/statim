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
  (vault) => vault.remove("notifications.icloudNotes"),
  renameTradesCredential,
];

function parsed(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function renameTradesCredential(vault: VaultEntries): Promise<void> {
  const accounts = parsed(await vault.get("accounts.index"));
  if (!Array.isArray(accounts)) return;
  for (const account of accounts as { id: string }[]) {
    const entry = `account.${account.id}.credentials`;
    const credentials = parsed(await vault.get(entry));
    if (!credentials || typeof credentials !== "object" || !("trades" in credentials)) continue;
    const { trades, ...rest } = credentials;
    await vault.set(entry, JSON.stringify({ ...rest, lifi: trades }));
  }
}
