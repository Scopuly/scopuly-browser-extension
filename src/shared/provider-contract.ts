export const SCOPULY_PROVIDER_VERSION = '0.3.0';

export const SCOPULY_PROVIDER_ERROR = {
  INTERNAL: -1,
  EXTERNAL_SERVICE: -2,
  INVALID_REQUEST: -3,
  USER_REJECTED: -4
} as const;

export type ScopulyProviderError = {
  code: number;
  message: string;
};

export class ScopulyProviderRequestError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'ScopulyProviderRequestError';
    this.code = code;
  }
}

export function createProviderError(code: number, message: string) {
  return new ScopulyProviderRequestError(code, message);
}

export function serializeProviderError(
  error: unknown,
  fallbackCode: number = SCOPULY_PROVIDER_ERROR.INTERNAL
): ScopulyProviderError {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      code: typeof candidate.code === 'number' ? candidate.code : fallbackCode,
      message: typeof candidate.message === 'string' && candidate.message
        ? candidate.message
        : 'Scopuly provider request failed.'
    };
  }

  return {
    code: fallbackCode,
    message: typeof error === 'string' && error ? error : 'Scopuly provider request failed.'
  };
}

export function providerErrorMessage(error: unknown, fallback = 'Scopuly request failed.') {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return typeof error === 'string' && error ? error : fallback;
}
