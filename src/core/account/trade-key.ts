import { readCredential, writeCredential } from '@/core/account/credentials';

export const loadTradeKey = (accountId: string) => readCredential(accountId, 'trades');
export const saveTradeKey = (accountId: string, key: string) =>
  writeCredential(accountId, 'trades', key);
