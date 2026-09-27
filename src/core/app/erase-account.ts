import { useAccountStore } from '../account/account-store';
import { useLockStore } from '../account/lock-store';
import { vaultWipe } from '@/storage/vault';
import { accountRuntime } from '@/runtime';

export async function eraseAccount(accountId?: string): Promise<void> {
  const accountState = useAccountStore.getState();
  const targetId = accountId ?? accountState.activeAccountId;
  if (!targetId) return;

  const account = accountState.accounts.find((candidate) => candidate.id === targetId);
  if (!account) throw new Error(`Account ${targetId} does not exist.`);

  await accountRuntime.erase(account);
  await useAccountStore.getState().removeErasedAccount(targetId);
}

export async function eraseAllAccounts(): Promise<void> {
  const accountState = useAccountStore.getState();
  const ids = accountState.accounts.map((account) => account.id);
  const ordered = ids.filter((id) => id !== accountState.activeAccountId);
  if (accountState.activeAccountId) ordered.push(accountState.activeAccountId);

  for (const id of ordered) await eraseAccount(id);
  await vaultWipe();
  await useLockStore.getState().evaluate();
}
