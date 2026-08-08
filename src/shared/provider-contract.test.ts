import { describe, expect, it } from 'vitest';
import {
  SCOPULY_PROVIDER_ERROR,
  createProviderError,
  providerErrorMessage,
  serializeProviderError
} from './provider-contract';

describe('provider contract errors', () => {
  it('keeps stable provider error codes', () => {
    const error = createProviderError(
      SCOPULY_PROVIDER_ERROR.USER_REJECTED,
      'User rejected.'
    );

    expect(serializeProviderError(error)).toEqual({
      code: -4,
      message: 'User rejected.'
    });
  });

  it('normalizes unknown errors without leaking implementation details', () => {
    expect(serializeProviderError(new Error('Bridge unavailable.'))).toEqual({
      code: -1,
      message: 'Bridge unavailable.'
    });
    expect(providerErrorMessage({ code: -3, message: 'Invalid request.' })).toBe('Invalid request.');
  });
});
