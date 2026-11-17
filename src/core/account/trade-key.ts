import { readCredential, writeCredential } from "@/core/account/credentials";

export const loadTradeKey = (accountId: string) => readCredential(accountId, "lifi");
export const saveTradeKey = (accountId: string, key: string) => writeCredential(accountId, "lifi", key);

export const loadLcxKey = (accountId: string) => readCredential(accountId, "lcx");
export const saveLcxKey = (accountId: string, key: string) => writeCredential(accountId, "lcx", key);
