import { registerKeystone } from './keystone';
import { registerLedger } from './ledger';
import { registerTrezor } from './trezor';

export function registerHardwareVendors(): void {
  registerLedger();
  registerKeystone();
  registerTrezor();
}
