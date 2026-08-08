import { describe, expect, it } from 'vitest';
import { analyzeOrigin } from './security';

describe('analyzeOrigin', () => {
  it('treats an unknown HTTPS origin as a first-connection risk', () => {
    const result = analyzeOrigin('https://example.com');

    expect(result.level).toBe('medium');
    expect(result.secure).toBe(true);
    expect(result.known).toBe(false);
    expect(result.reasons).toContain('First connection from this website.');
  });

  it('flags non-local HTTP origins as high risk', () => {
    const result = analyzeOrigin('http://example.com');

    expect(result.level).toBe('high');
    expect(result.secure).toBe(false);
    expect(result.reasons).toContain('This site is not using HTTPS.');
  });

  it('allows localhost to remain distinguishable from insecure remote sites', () => {
    const result = analyzeOrigin('http://localhost:5173');

    expect(result.local).toBe(true);
    expect(result.level).toBe('medium');
    expect(result.reasons).not.toContain('This site is not using HTTPS.');
  });

  it('prioritizes an explicit blocked policy', () => {
    const origin = 'https://blocked.example';
    const result = analyzeOrigin(origin, [], [
      { origin, status: 'blocked', updatedAt: Date.now() }
    ]);

    expect(result.level).toBe('critical');
    expect(result.policy).toBe('blocked');
  });
});
