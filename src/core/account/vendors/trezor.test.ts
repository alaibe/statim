import { handleTrezorCallback, isTrezorCallback, trezorSigner } from './trezor';

const mockOpened: string[] = [];
jest.mock('@/lib/open-url', () => ({
  openExternal: async (url: string) => void mockOpened.push(url),
}));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `statim://${path}` }));

beforeEach(() => mockOpened.splice(0));

function lastRequest() {
  const url = new URL(mockOpened.at(-1)!);
  return {
    url,
    method: url.searchParams.get('method'),
    params: JSON.parse(url.searchParams.get('params')!),
    callback: url.searchParams.get('callback')!,
  };
}

const answer = (callback: string, response: object) =>
  handleTrezorCallback(`${callback}&response=${encodeURIComponent(JSON.stringify(response))}`);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Trezor through Trezor Suite', () => {
  it('asks Trezor Connect for the address and reads the answer Suite sends back', async () => {
    const address = trezorSigner().getAddress("m/44'/60'/0'/0/0");
    await flush();
    const request = lastRequest();

    expect(request.url.origin + request.url.pathname).toBe(
      'https://connect.trezor.io/10/deeplink/1/'
    );
    expect(request.method).toBe('ethereumGetAddress');
    expect(request.params).toEqual({ path: "m/44'/60'/0'/0/0", showOnTrezor: false });
    expect(request.url.searchParams.get('appName')).toBe('Statim');
    expect(isTrezorCallback(request.callback)).toBe(true);

    expect(answer(request.callback, { success: true, payload: { address: '0xabc' } })).toBe(true);
    await expect(address).resolves.toBe('0xabc');
  });

  it('turns a transaction signature into its parity', async () => {
    const signed = trezorSigner().signTransaction('p', {
      chainId: 1,
      to: '0x1111111111111111111111111111111111111111',
      gas: 21000n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
    });
    await flush();
    const { params, callback } = lastRequest();
    expect(params.transaction).toMatchObject({
      chainId: 1,
      gasLimit: '0x5208',
      maxFeePerGas: '0x2',
    });

    answer(callback, { success: true, payload: { v: '0x1', r: '0x01', s: '0x02' } });
    await expect(signed).resolves.toMatchObject({ yParity: 1 });
  });

  it('passes on what Suite says when it fails', async () => {
    const message = trezorSigner().signMessage('p', new Uint8Array([1]));
    await flush();
    answer(lastRequest().callback, { success: false, payload: { error: 'Cancelled by user' } });
    await expect(message).rejects.toThrow('Cancelled by user');
  });

  it('ignores links that are not an answer it waits for', () => {
    expect(isTrezorCallback('statim://chat/abc')).toBe(false);
    expect(handleTrezorCallback('statim://trezor?id=nobody&response=%7B%7D')).toBe(false);
  });
});
