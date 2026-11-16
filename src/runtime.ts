import { AccountRuntime } from "@/core/app/account-runtime";
import type { MessageId } from "@/core/messaging/types";
import { PROTOCOLS } from "@/protocols";

export const accountRuntime = new AccountRuntime(PROTOCOLS);

export function wasProactive(id: MessageId): boolean {
  return accountRuntime.wasProactive(id);
}
