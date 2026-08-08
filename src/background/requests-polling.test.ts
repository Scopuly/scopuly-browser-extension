import { describe, expect, it } from 'vitest';
import { mobileStatusPollDelay } from './requests';

describe('mobile bridge polling backoff', () => {
  it('backs off and caps polling across worker restarts', () => {
    expect(mobileStatusPollDelay()).toBe(2_500);
    expect(mobileStatusPollDelay(1)).toBe(2_500);
    expect(mobileStatusPollDelay(2)).toBe(5_000);
    expect(mobileStatusPollDelay(3)).toBe(10_000);
    expect(mobileStatusPollDelay(20)).toBe(10_000);
  });
});
