import { describe, it, expect } from 'vitest';
import { lmQty } from '../src/shared/engine';
import type { LmItem } from '../src/shared/types';

const item = (allocations: Record<string, number>): LmItem =>
  ({ allocations } as LmItem);

describe('lmQty — allocations are per-room multipliers, scaled by room count', () => {
  const counts = [1, 5, 4, 1, 2, 1, 13, 0, 0, 0]; // idx6 = 13 rooms, idx7-9 = none

  it('1 against a 13-room type contributes 13', () => {
    expect(lmQty(item({ '6': 1, '7': 4, '9': 5 }), counts)).toBe(13);
  });

  it('room-less types (count 0) contribute nothing', () => {
    expect(lmQty(item({ '7': 2, '8': 4, '9': 2 }), counts)).toBe(0);
  });

  it('sums per-type: Σ per × count', () => {
    expect(lmQty(item({ '0': 16, '4': 6, '6': 2 }), counts)).toBe(16 * 1 + 6 * 2 + 2 * 13);
  });

  it('without counts, entries are absolute (× 1)', () => {
    expect(lmQty(item({ '6': 1, '7': 4, '9': 5 }))).toBe(10);
  });
});
