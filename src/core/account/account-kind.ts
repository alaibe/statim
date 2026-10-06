import type { Keyring } from './keyring';

export type AccountKind = 'phrase' | 'hardware';

export interface AccountCapabilities {
  chat: boolean;
  evm: boolean;
  otherChains: boolean;
  confirmsOnDevice: boolean;
}

export function capabilitiesOf(keyring: Pick<Keyring, 'kind' | 'wallet'>): AccountCapabilities {
  return {
    chat: true,
    evm: true,
    otherChains: keyring.wallet !== null,
    confirmsOnDevice: keyring.kind === 'hardware',
  };
}

export function describeKind(kind: AccountKind): string {
  return kind === 'hardware'
    ? 'On a hardware wallet · confirms on the device'
    : 'On this device · recovery phrase';
}
