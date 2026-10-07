import {
  BaseError,
  ExecutionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  LimitExceededRpcError,
  TimeoutError,
  UserRejectedRequestError,
} from 'viem';

import { errorMessage } from '@/core/errors';

import type { ChainStrategy } from './chains/strategy';

/** `before`: nothing has been signed. `after`: it may have been broadcast. `lookup`: a read. */
const ACTIONS = {
  review: { verb: 'review this transfer', stage: 'before' },
  send: { verb: 'complete this payment', stage: 'after' },
  balance: { verb: 'load the balance', stage: 'lookup' },
  fees: { verb: 'load fees', stage: 'lookup' },
  quote: { verb: 'quote this trade', stage: 'before' },
  trade: { verb: 'complete this trade', stage: 'after' },
  status: { verb: 'check this bridge', stage: 'lookup' },
} as const;

interface Cause {
  message?: unknown;
  name?: unknown;
  code?: unknown;
  status?: unknown;
  cause?: unknown;
}

type Failure = ReturnType<typeof failureOf>;
type Attempt = ReturnType<typeof attemptOf>;

const RATE_LIMITED =
  /rate[ -]?limit|too many requests|(?:\b(?:HTTP(?: error| status)?|status:?)\s+|\bfailed \(|\breturned )429\b/i;
const DENIED =
  /(?:\b(?:HTTP(?: error| status)?|status:?)\s+|\bfailed \(|\breturned )(?:401|403)\b/i;
const REVERTED = /execution reverted|transaction reverted|transfer reverted/i;
const OUT_OF_FUNDS =
  /out[ _-]?of[ _-]?funds|insufficient (?:funds|balance|lamports)|not enough (?:funds|balance|lamports)|exceeds (?:the )?(?:transaction sender account )?balance/i;
const UNSUPPORTED_CHAIN =
  /unsupported (?:chain|network)|(?:chain|network)[^\n]*\b(?:not supported|not available in this app|not configured)\b/i;
const CANCELLED = /\buser (?:rejected|denied|cancell?ed)\b|\bauthentication (?:was )?cancell?ed\b/i;
const INVALID_RECIPIENT =
  /invalid (?:recipient|address)|(?:recipient|address)[^\n]*(?:is not valid|is invalid)|is not (?:an? )?(?:\w+ )?address/i;
const TIMED_OUT = /timed?\s*out|timeout/i;
const UNREACHABLE_CODE = /^(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|ENETUNREACH)$/;
const UNREACHABLE =
  /fetch failed|failed to fetch|network request failed|network error|offline|connection (?:closed|failed|lost)|socket (?:closed|hang up)|HTTP request failed|\bHTTP(?: error| status)?\s*\d{3}\b|\b(?:failed \(|returned )(?:408|5\d{2})/i;
const DIAGNOSTIC =
  /(?:https?|wss?):\/\/|\b(?:rpc|json|stack|authorization|bearer|api[ _-]?key|password|secret|credential)\b|request body|\b(?:url|headers|details|version):|\bviem@|\bat \S+\s*\(|transaction creation failed/i;

const RULES: {
  matches: (failure: Failure) => boolean;
  message: (attempt: Attempt) => string;
  mayHaveSent: boolean;
}[] = [
  {
    matches: ({ causes, text }) =>
      causes.some(
        (entry) =>
          entry instanceof LimitExceededRpcError ||
          entry.status === 429 ||
          entry.code === 429 ||
          entry.code === -32005
      ) || RATE_LIMITED.test(text),
    message: ({ action, chainName }) =>
      `A remote server is limiting requests, so we could not ${action} on ${chainName}. Wait for the limit to reset.`,
    mayHaveSent: true,
  },
  {
    matches: ({ causes, text, reverted }) =>
      causes.some((entry) => entry instanceof InsufficientFundsError) ||
      (!reverted && OUT_OF_FUNDS.test(text)),
    message: ({ currency, chainName }) =>
      `Not enough ${currency} on ${chainName} for this transfer. Add ${currency} on ${chainName} and keep enough for fees. Funds on other chains cannot pay these fees.`,
    mayHaveSent: false,
  },
  {
    matches: ({ causes, text }) =>
      causes.some((entry) => entry.code === 4902) || UNSUPPORTED_CHAIN.test(text),
    message: ({ chainName }) =>
      `${chainName} is not available for this operation in this app. Choose another supported chain with /chains.`,
    mayHaveSent: false,
  },
  {
    matches: ({ causes, text }) =>
      causes.some((entry) => entry instanceof UserRejectedRequestError || entry.code === 4001) ||
      CANCELLED.test(text),
    message: ({ chainName }) =>
      `The ${chainName} request was cancelled. Review the request details and approve only if you want to continue.`,
    mayHaveSent: false,
  },
  {
    matches: ({ reverted }) => reverted,
    message: ({ stage, action, chainName, currency }) =>
      ({
        lookup: `Could not ${action} on ${chainName} because the chain rejected the lookup. Check the selected chain and token, then try the lookup again.`,
        before: `This transfer would be rejected on ${chainName}. Check the recipient, amount and token; the recipient contract may not accept this transfer.`,
        after: `The transfer was rejected or reverted on ${chainName}. Check the recipient, amount and token before continuing; a reverted transaction may still cost ${currency} in fees.`,
      })[stage],
    mayHaveSent: false,
  },
  {
    matches: ({ text }) => INVALID_RECIPIENT.test(text),
    message: ({ chainName }) =>
      `The recipient is not a valid address for ${chainName}. Check and correct the full recipient address, and confirm it belongs to this chain.`,
    mayHaveSent: false,
  },
  {
    matches: ({ causes, text }) =>
      causes.some((entry) => entry.status === 401 || entry.status === 403) || DENIED.test(text),
    message: ({ action, chain, chainName }) =>
      `The remote server denied access while trying to ${action} on ${chainName}. Check the endpoint URL and access key in ${chain ? `/rpc --chain ${chain.id}` : 'the chain settings'}.`,
    mayHaveSent: true,
  },
  {
    matches: ({ causes, text }) =>
      causes.some((entry) => entry instanceof TimeoutError || entry.code === 'ETIMEDOUT') ||
      TIMED_OUT.test(text),
    message: ({ action, chainName }) =>
      `A remote server did not respond in time, so we could not ${action} on ${chainName}. Check your connection and wait for the server to recover.`,
    mayHaveSent: true,
  },
  {
    matches: ({ causes, text }) =>
      causes.some(
        (entry) =>
          entry instanceof HttpRequestError ||
          entry.code === 4900 ||
          entry.code === 4901 ||
          entry.name === 'AbortError' ||
          UNREACHABLE_CODE.test(String(entry.code))
      ) || UNREACHABLE.test(text),
    message: ({ action, chainName }) =>
      `Could not ${action} on ${chainName} because a remote server could not be reached. Check your internet connection and wait for the server to recover.`,
    mayHaveSent: true,
  },
];

function failureOf(error: unknown) {
  const causes: Cause[] = [];
  const seen = new Set<object>();
  let cause = error;
  while (cause && typeof cause === 'object' && !seen.has(cause)) {
    seen.add(cause);
    causes.push(cause);
    cause = (cause as Cause).cause;
  }
  const text = [
    typeof error === 'string' ? error : '',
    ...causes.map((entry) =>
      entry instanceof BaseError
        ? `${entry.shortMessage}\n${entry.details ?? ''}`
        : typeof entry.message === 'string'
          ? entry.message
          : ''
    ),
  ].join('\n');
  const reverted =
    causes.some(
      (entry) =>
        entry instanceof ExecutionRevertedError || entry.code === ExecutionRevertedError.code
    ) || REVERTED.test(text);
  return { causes, text, reverted };
}

function attemptOf(chain: ChainStrategy | undefined, operation: keyof typeof ACTIONS) {
  const { verb: action, stage } = ACTIONS[operation];
  return {
    chain,
    chainName: chain?.name ?? 'the selected chain',
    currency: chain?.transfer?.symbol ?? 'the native currency',
    action,
    stage,
  };
}

function sendStatus(stage: Attempt['stage'], mayHaveSent: boolean): string {
  if (stage === 'before') return ' Nothing was sent.';
  return stage === 'after' && mayHaveSent
    ? ' The payment may have been submitted. Check your transaction history or the block explorer before trying again to avoid sending twice.'
    : '';
}

export function walletErrorMessage(
  error: unknown,
  chain: ChainStrategy | undefined,
  operation: keyof typeof ACTIONS
): string {
  const failure = failureOf(error);
  const attempt = attemptOf(chain, operation);
  const rule = RULES.find(({ matches }) => matches(failure));
  if (rule) return rule.message(attempt) + sendStatus(attempt.stage, rule.mayHaveSent);

  const ordinary = errorMessage(error, '').trim();
  const diagnostic =
    failure.causes.some((entry) => entry instanceof BaseError || typeof entry.code === 'number') ||
    DIAGNOSTIC.test(failure.text);
  const status = sendStatus(attempt.stage, true);
  if (ordinary && !diagnostic) return `${ordinary}${status}`;
  return `Could not ${attempt.action} on ${attempt.chainName} because the remote server returned an unexpected error. Check the selected chain and wait for the server to recover.${status}`;
}

export function sentPaymentErrorMessage(chainName: string, hash: string, noun = 'payment'): string {
  return `Your ${noun} was sent on ${chainName}, but its confirmation could not be posted in the chat. Do not send it again. Check the block explorer for its status. Transaction hash: ${hash}`;
}
