import { capabilitiesOf, describeKind } from './account-kind';

import { privateKeyToAccount } from 'viem/accounts';

import { useAccountStore } from './account-store';
import { FakeHardwareSigner } from './testing/fake-hardware';

describe('capabilitiesOf', () => {
  it('lets a phrase account do everything', () => {
    expect(capabilitiesOf('phrase')).toEqual({
      chat: true,
      evm: true,
      otherChains: true,
      confirmsOnDevice: false,
    });
  });

  it('lets a hardware account chat', () => {
    // The signature XMTP asks for registers an installation. After that the
    // installation key signs, and `Client.build` reopens it with no signer,
    // so a Ledger signs once at setup and never per message or per launch.
    expect(capabilitiesOf('hardware').chat).toBe(true);
  });

  it('lets a hardware account spend, on the device', () => {
    expect(capabilitiesOf('hardware').evm).toBe(true);
    expect(capabilitiesOf('hardware').confirmsOnDevice).toBe(true);
  });

  it('does not claim Bitcoin and Solana on hardware until they are wired up', () => {
    expect(capabilitiesOf('hardware').otherChains).toBe(false);
  });
});

describe('describeKind', () => {
  it('says how it signs, which is the difference that shows', () => {
    expect(describeKind('hardware')).toContain('device');
    expect(describeKind('phrase')).toContain('recovery phrase');
  });
});

const KEY = `0x${'55'.repeat(32)}` as const;
const ADDRESS = privateKeyToAccount(KEY).address;
const PATH = "m/44'/60'/0'/0/0";

const add = (label = 'My Ledger') =>
  useAccountStore.getState().addHardwareAccount({
    address: ADDRESS,
    vendorId: 'ledger',
    label,
    path: PATH,
    device: 'usb-1',
    signer: new FakeHardwareSigner(KEY),
  });

describe('adding a hardware account', () => {
  beforeEach(() =>
    useAccountStore.setState({
      accounts: [],
      activeAccountId: null,
      keyring: null,
      status: 'absent',
    })
  );

  it('opens it at once, with the wallet signing and chat keys from its signature', async () => {
    await add();

    const state = useAccountStore.getState();
    const [record] = state.accounts;
    expect(record).toMatchObject({
      kind: 'hardware',
      vendorId: 'ledger',
      path: PATH,
      device: 'usb-1',
    });
    expect(state.status).toBe('ready');
    expect(state.keyring?.kind).toBe('hardware');
    expect(state.keyring?.address).toBe(ADDRESS);
    expect(state.chatKeys).toBe(true);
    expect(state.keyring?.derive("m/44'/1237'/0'/0/0").privateKey).toHaveLength(32);
  });

  it('opens again after a relaunch instead of asking for a recovery phrase', async () => {
    await add();
    const before = useAccountStore.getState().keyring?.derive("m/44'/1237'/0'/0/0").privateKey;
    useAccountStore.setState({
      status: 'loading',
      keyring: null,
      accounts: [],
      activeAccountId: null,
    });

    await useAccountStore.getState().restore();

    const state = useAccountStore.getState();
    expect(state.status).toBe('ready');
    expect(state.keyring?.kind).toBe('hardware');
    expect(state.keyring?.derive("m/44'/1237'/0'/0/0").privateKey).toEqual(before);
  });

  it('never turns a phrase account into a wallet one, which would drop its phrase', async () => {
    useAccountStore.setState({
      accounts: [{ id: 'p', label: 'Main', address: ADDRESS, createdAt: 0, kind: 'phrase' }],
    });
    const signer = new FakeHardwareSigner(KEY);
    await expect(
      useAccountStore.getState().addHardwareAccount({
        address: ADDRESS,
        vendorId: 'ledger',
        label: 'Ledger',
        path: PATH,
        signer,
      })
    ).rejects.toThrow(/already here as Main/);
    expect(signer.calls).toEqual([]);
    expect(useAccountStore.getState().accounts[0].kind).toBe('phrase');
  });

  it('adopts an existing row rather than adding a second for one address', async () => {
    // Two rows sharing an address would fight over one message database.
    await add();
    await add('Again');
    expect(useAccountStore.getState().accounts).toHaveLength(1);
  });
});
