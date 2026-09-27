import { isAddress, type Address } from 'viem';

import { isNumber, isString, optional, shape } from '@/lib/guards';

export interface PaymentRequest {
  amount: string;
  symbol: string;
  chain?: string;
  chainId?: number;
  to: string;
  note?: string;
}

export interface SplitRequest {
  total: string;
  share: string;
  people: number;
  symbol: string;
  chainId: number;
  to: Address;
  note?: string;
}

export interface PaymentReceipt {
  hash: string;
  chain?: string;
  chainId?: number;
  amount: string;
  symbol: string;
  to: string;
}

export const isPaymentRequest = shape<PaymentRequest>({
  amount: isString,
  symbol: isString,
  chain: optional(isString),
  chainId: optional(isNumber),
  to: isString,
  note: optional(isString),
});

export const isSplitRequest = shape<SplitRequest>({
  total: isString,
  share: isString,
  people: isNumber,
  symbol: isString,
  chainId: isNumber,
  to: (value): value is Address => isString(value) && isAddress(value),
  note: optional(isString),
});

export const isPaymentReceipt = shape<PaymentReceipt>({
  hash: isString,
  chain: optional(isString),
  chainId: optional(isNumber),
  amount: isString,
  symbol: isString,
  to: isString,
});

export const CONTENT_TYPE_PAYMENT_REQUEST = 'eth.payment.request';
export const CONTENT_TYPE_PAYMENT_RECEIPT = 'eth.payment.receipt';
export const CONTENT_TYPE_PAYMENT_SPLIT = 'eth.payment.split';
