import { stringToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { CHAT_KEY_MESSAGE, chatSeedFrom, hardwareKeyring } from './chat-seed';
import { hardwareAccount } from './hardware';
import { FakeHardwareSigner } from './testing/fake-hardware';

const KEY = `0x${'22'.repeat(32)}` as const;
const ADDRESS = privateKeyToAccount(KEY).address;
const sign = () => new FakeHardwareSigner(KEY).signMessage('m', stringToBytes(CHAT_KEY_MESSAGE));

describe('chat keys of a hardware account', () => {
  it('come out the same from the same wallet, so every device of it agrees', async () => {
    expect(chatSeedFrom(await sign())).toBe(chatSeedFrom(await sign()));
    expect(chatSeedFrom(await sign())).toHaveLength(2 + 128);
  });

  it('derive chat keys from the seed but sign Ethereum on the device', async () => {
    const device = new FakeHardwareSigner(KEY);
    const keyring = hardwareKeyring(hardwareAccount(device, ADDRESS), chatSeedFrom(await sign()));

    expect(keyring.kind).toBe('hardware');
    expect(keyring.mnemonic).toBeNull();
    expect(keyring.derive("m/44'/1237'/0'/0/0").privateKey).toHaveLength(32);
    expect(() => keyring.deriveEd25519("m/44'/501'/0'/0'")).toThrow(/recovery phrase/);

    await keyring.account.signMessage({ message: 'x' });
    expect(device.calls).toContain("signMessage:m/44'/60'/0'/0/0");
  });

  it('say where to set them up when the seed is missing', () => {
    const keyring = hardwareKeyring(hardwareAccount(new FakeHardwareSigner(KEY), ADDRESS), null);
    expect(() => keyring.derive("m/44'/1237'/0'/0/0")).toThrow(/Settings › Accounts/);
  });
});
