import { describe, it, expect } from 'vitest';
import { isNewer } from '../src/server/version';

describe('isNewer', () => {
  it('detects a newer release', () => {
    expect(isNewer('0.1.0', '0.2.0')).toBe(true);
    expect(isNewer('0.1.0', '0.1.1')).toBe(true);
    expect(isNewer('1.9.0', '2.0.0')).toBe(true);
  });
  it('rejects same or older', () => {
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.2.0', '0.1.9')).toBe(false);
    expect(isNewer('2.0.0', '1.9.9')).toBe(false);
  });
  it('tolerates a leading v and missing parts', () => {
    expect(isNewer('1.2', 'v1.2.1')).toBe(true);
    expect(isNewer('v1.2.0', '1.2')).toBe(false);
  });
});
