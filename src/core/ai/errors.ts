export type AiErrorCode =
  | 'unavailable'
  | 'refused'
  | 'too-long'
  /** The translation language is supported but not downloaded. */
  | 'language-missing'
  | 'language-unsupported'
  | 'quota'
  | 'server';

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export function isAiError(error: unknown, code?: AiErrorCode): error is AiError {
  return error instanceof AiError && (code === undefined || error.code === code);
}

const NATIVE_CODES: Record<string, AiErrorCode> = {
  ERR_UNAVAILABLE: 'unavailable',
  ERR_REFUSED: 'refused',
  ERR_TOO_LONG: 'too-long',
  ERR_LANGUAGE_MISSING: 'language-missing',
  ERR_LANGUAGE_UNSUPPORTED: 'language-unsupported',
  ERR_QUOTA: 'quota',
};

/** The device module and the desktop shell reject with `{ code, message }`. */
export function fromNative(error: unknown): AiError {
  if (error instanceof AiError) return error;
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  const text = typeof message === 'string' && message ? message : String(error);
  return new AiError(
    (typeof code === 'string' && NATIVE_CODES[code]) || 'server',
    text.replace(/^Error: /, '')
  );
}
