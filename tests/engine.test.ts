import { describe, it, expect } from 'vitest';
import { lmQty, lmDerived, itemSell, settingsOf } from '../src/shared/engine';
import type { LmItem, ProjectState } from '../src/shared/types';

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

describe('category contingency is applied at calculation time', () => {
  const stateWith = (contingency: number, name = 'Installation'): ProjectState =>
    ({
      details: { gst: 0.1 },
      categories: [{ name, contingency }],
      labour_materials: [],
      catalogue: [],
      room_types: [],
      rooms: [],
    } as unknown as ProjectState);

  const labour = (category: string): LmItem =>
    ({ kind: 'labour', category, cost: 100, sell_entered: 140, allocations: {} } as LmItem);

  it('re-prices labour when the contingency changes (the field used to do nothing)', () => {
    const at0 = lmDerived(labour('Installation'), settingsOf(stateWith(0)));
    const at10 = lmDerived(labour('Installation'), settingsOf(stateWith(0.1)));
    expect(at0.sell).toBe(140);
    expect(at10.sell).toBeCloseTo(150, 6); // 100 × (1 + 0.40 + 0.10)
    // the entered mark-up is unchanged — contingency sits on top of it
    expect(at10.markup).toBeCloseTo(at0.markup, 6);
    expect(at10.markupWithContingency).toBeCloseTo(0.5, 6);
  });

  it('matches labour to its category even when the row name has stray whitespace', () => {
    const padded = lmDerived(labour('Installation '), settingsOf(stateWith(0.1)));
    expect(padded.sell).toBeCloseTo(150, 6);
  });

  it('behaves the same way equipment contingency does', () => {
    const s = settingsOf(stateWith(0.1, 'Equipment'));
    // equipment: cost × (1 + markup + contingency) — the reference behaviour
    expect(itemSell({ cost: 100, markup: 0.4 } as never, s)).toBeCloseTo(150, 6);
  });

  it('leaves a zero-cost row alone (nothing to take a percentage of)', () => {
    const free = { kind: 'labour', category: 'Installation', cost: 0, sell_entered: 250 } as LmItem;
    expect(lmDerived(free, settingsOf(stateWith(0.1))).sell).toBe(250);
  });
});
