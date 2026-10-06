import { privateKeyToAccount } from 'viem/accounts';

import type { AccountRecord } from './accounts';
import { useDevicePrompt } from './device-prompt';
import { deviceSigner, holdDevice, releaseDevice } from './device-session';
import { registerVendor, type HardwareSigner } from './hardware';
import { FakeHardwareSigner } from './testing/fake-hardware';

const KEY = `0x${'33'.repeat(32)}` as const;
const OTHER = `0x${'44'.repeat(32)}` as const;
const ADDRESS = privateKeyToAccount(KEY).address;

const record = (id: string, device?: string): AccountRecord => ({
  id,
  label: 'Ledger',
  address: ADDRESS,
  createdAt: 0,
  kind: 'hardware',
  vendorId: 'test-link',
  device,
});

let devices: Record<string, HardwareSigner>;

beforeAll(() =>
  registerVendor({
    id: 'test-link',
    label: 'Test',
    connection: 'usb',
    scan: async () => () => {},
    connect: async (id) => {
      const device = devices[id];
      if (!device) throw new Error('Not plugged in');
      return device;
    },
  })
);

beforeEach(() => {
  devices = { right: new FakeHardwareSigner(KEY), wrong: new FakeHardwareSigner(OTHER) };
  useDevicePrompt.setState({ prompt: null });
});

const answerPrompt = (signer: HardwareSigner) =>
  new Promise<void>((resolve) => {
    const stop = useDevicePrompt.subscribe(({ prompt }) => {
      if (prompt?.kind !== 'connect') return;
      stop();
      prompt.settle(signer);
      resolve();
    });
  });

describe('the wallet behind a hardware account', () => {
  it('reconnects to the device it last used without asking', async () => {
    const signer = deviceSigner(record('a', 'right'));
    await signer.signMessage("m/44'/60'/0'/0/0", new Uint8Array([1]));
    expect(useDevicePrompt.getState().prompt).toBeNull();
    releaseDevice('a');
  });

  it('asks the person when the last device is gone or holds another account', async () => {
    for (const device of [undefined, 'wrong']) {
      const answered = answerPrompt(devices.right);
      await deviceSigner(record(`b-${device}`, device)).signMessage('p', new Uint8Array([1]));
      await answered;
      releaseDevice(`b-${device}`);
    }
  });

  it('keeps the connection once made, and shows that it waits on the device', async () => {
    const device = new FakeHardwareSigner(KEY);
    holdDevice('c', device);
    const seen: string[] = [];
    const stop = useDevicePrompt.subscribe(({ prompt }) => prompt && seen.push(prompt.kind));

    await deviceSigner(record('c')).signMessage('p', new Uint8Array([1]));
    await deviceSigner(record('c')).signMessage('p', new Uint8Array([2]));

    stop();
    expect(device.calls).toEqual(['signMessage:p', 'signMessage:p']);
    expect(seen).toEqual(['confirm', 'confirm']);
    expect(useDevicePrompt.getState().prompt).toBeNull();
    releaseDevice('c');
  });

  it('passes a refusal on without dropping the connection', async () => {
    const device = new FakeHardwareSigner(KEY);
    device.refuse = true;
    holdDevice('d', device);
    await expect(deviceSigner(record('d')).signMessage('p', new Uint8Array([1]))).rejects.toThrow(
      /Rejected/
    );
    device.refuse = false;
    await deviceSigner(record('d')).signMessage('p', new Uint8Array([1]));
    expect(device.calls).toHaveLength(2);
    releaseDevice('d');
  });

  it('reconnects once when the link dropped mid-request', async () => {
    const dropped: HardwareSigner = {
      ...new FakeHardwareSigner(KEY),
      label: 'Test',
      getAddress: async () => ADDRESS,
      signMessage: async () => {
        throw new Error('Device disconnected');
      },
      signTransaction: async () => {
        throw new Error('Device disconnected');
      },
      signTypedData: async () => {
        throw new Error('Device disconnected');
      },
    };
    holdDevice('e', dropped);
    await deviceSigner(record('e', 'right')).signMessage('p', new Uint8Array([1]));
    expect((devices.right as FakeHardwareSigner).calls).toContain('signMessage:p');
    releaseDevice('e');
  });
});
