import AppEth from '@ledgerhq/hw-app-eth';
import {
  recoverMessageAddress,
  recoverTransactionAddress,
  recoverTypedDataAddress,
  stringToBytes,
} from 'viem';

import { CHAT_KEY_MESSAGE } from '../chat-seed';
import { DEFAULT_EVM_PATH, hardwareAccount } from '../hardware';
import { ledgerSigner } from './ledger-signer';
import { speculosTransport } from './speculos';

/**
 * Ledger's own Ethereum app in Speculos on port 5000, with Hardhat's test phrase
 * and Blind signing on: `SPECULOS=1 npx jest ledger.speculos`.
 */
const API = 'http://127.0.0.1:5000';
const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const run = process.env.SPECULOS ? describe : describe.skip;

// React Native's fetch, which Jest loads, goes nowhere; Node's http does.
function mockRequest(url: string, init: { method?: string; body?: string } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http = require('node:http') as typeof import('node:http');
  return new Promise<{ ok: boolean; json(): Promise<unknown> }>((resolve, reject) => {
    const sent = http.request(
      url,
      { method: init.method ?? 'GET', headers: { 'Content-Type': 'application/json' } },
      (response) => {
        let text = '';
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () =>
          resolve({ ok: (response.statusCode ?? 500) < 400, json: async () => JSON.parse(text) })
        );
      }
    );
    sent.on('error', reject);
    sent.end(init.body);
  });
}
jest.mock('@/lib/http', () => ({ appFetch: (url: string, init: never) => mockRequest(url, init) }));

const press = (button: 'right' | 'both') =>
  mockRequest(`${API}/button/${button}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'press-and-release' }),
  });

async function screen(): Promise<string> {
  const { events } = (await (await mockRequest(`${API}/events?currentscreenonly=true`)).json()) as {
    events: { text: string }[];
  };
  return events.map((event) => event.text).join(' ');
}

/** Walks the review screens the way a person would, and approves on the last one. */
async function approve(): Promise<void> {
  const home = /app is ready|App settings|App info|Quit app|signed|rejected/i;
  let shown = await screen();
  for (let i = 0; i < 60 && home.test(shown); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    shown = await screen();
  }
  const seen: string[] = [];
  for (let i = 0; i < 60; i += 1) {
    seen.push(shown);
    if (/^(Sign|Accept|Approve|Confirm)/i.test(shown)) {
      await press('both');
      return;
    }
    if (/accept risk, press\s+both/i.test(shown)) {
      await press('both');
      shown = await screen();
      continue;
    }
    await press('right');
    shown = await screen();
  }
  throw new Error(`No approve screen among: ${[...new Set(seen)].join(' / ')}`);
}

async function approved<T>(request: Promise<T>): Promise<T> {
  const [result] = await Promise.all([request, approve()]);
  return result;
}

/** Rejects whatever an earlier run left on screen and goes back to the app's home. */
async function reset(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const shown = await screen();
    if (/app is ready/i.test(shown)) return;
    await press(/^Reject/i.test(shown) ? 'both' : 'right');
  }
}

run('Ledger in Speculos', () => {
  jest.setTimeout(120_000);
  beforeAll(reset);
  const signer = ledgerSigner(new AppEth(speculosTransport()) as never);
  const account = hardwareAccount(signer, ADDRESS);

  it('reads the first account without asking', async () => {
    expect(await signer.getAddress(DEFAULT_EVM_PATH)).toBe(ADDRESS);
  });

  it('signs the chat key message the same way every time', async () => {
    const message = stringToBytes(CHAT_KEY_MESSAGE);
    const first = await approved(signer.signMessage(DEFAULT_EVM_PATH, message));
    const second = await approved(signer.signMessage(DEFAULT_EVM_PATH, message));
    expect(first).toBe(second);
    expect(await recoverMessageAddress({ message: { raw: message }, signature: first })).toBe(
      ADDRESS
    );
  });

  it('signs an EIP-1559 and a legacy EIP-155 transaction on Base', async () => {
    const base = { chainId: 8453, to: ADDRESS, value: 10n ** 15n, nonce: 7, gas: 21_000n } as const;
    for (const transaction of [
      { ...base, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n },
      { ...base, gasPrice: 2_000_000_000n, type: 'legacy' as const },
    ]) {
      const signed = await approved(account.signTransaction(transaction));
      expect(await recoverTransactionAddress({ serializedTransaction: signed as never })).toBe(
        ADDRESS
      );
    }
  });

  it('signs EIP-712 data', async () => {
    const typedData = {
      domain: { name: 'Statim', version: '1', chainId: 8453 },
      types: { Mail: [{ name: 'body', type: 'string' }] },
      primaryType: 'Mail',
      message: { body: 'hello' },
    } as const;
    const signature = await approved(account.signTypedData(typedData));
    expect(await recoverTypedDataAddress({ ...typedData, signature })).toBe(ADDRESS);
  });
});
