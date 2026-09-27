import { isPaymentReceipt, isPaymentRequest, isSplitRequest } from './types';

const address = '0x1234567890123456789012345678901234567890';

describe('payment payloads from another participant', () => {
  const request = { amount: '0.1', symbol: 'ETH', chain: 'ethereum', to: address, note: 'lunch' };
  const split = { total: '1', share: '0.5', people: 2, symbol: 'ETH', chainId: 1, to: address };
  const receipt = {
    hash: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnb',
    amount: '1',
    symbol: 'SOL',
    to: 'x',
  };

  it('accepts well-formed payloads', () => {
    expect(isPaymentRequest(request)).toBe(true);
    expect(isPaymentRequest({ amount: '1', symbol: 'SOL', to: 'x' })).toBe(true);
    expect(isSplitRequest(split)).toBe(true);
    expect(isPaymentReceipt(receipt)).toBe(true);
  });

  it.each([
    ['an amount that is an object', { ...request, amount: {} }],
    ['a recipient that is a number', { ...request, to: 42 }],
    ['a note that is not text', { ...request, note: ['x'] }],
    ['a chain id that is not a number', { ...request, chainId: '1' }],
    ['null', null],
    ['an array', [request]],
    ['a string', JSON.stringify(request)],
  ])('refuses a payment request with %s', (_, payload) => {
    expect(isPaymentRequest(payload)).toBe(false);
  });

  it('refuses a split whose recipient is not an EVM address or whose headcount is not a number', () => {
    expect(isSplitRequest({ ...split, to: 'alice.eth' })).toBe(false);
    expect(isSplitRequest({ ...split, people: '2' })).toBe(false);
    expect(isSplitRequest({ ...split, people: Number.NaN })).toBe(false);
  });

  it('refuses a receipt with no hash', () => {
    const { hash: _, ...unhashed } = receipt;
    expect(isPaymentReceipt(unhashed)).toBe(false);
    expect(isPaymentReceipt({ ...receipt, hash: 7 })).toBe(false);
  });
});
