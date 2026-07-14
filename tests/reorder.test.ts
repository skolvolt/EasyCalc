import { describe, it, expect } from 'vitest';
import { moveByDrop } from '../web/src/reorder';

const run = (arr: string[], from: number, to: number) => {
  const a = [...arr];
  moveByDrop(a, from, to);
  return a;
};

describe('moveByDrop — row lands on the drop target', () => {
  const base = ['A', 'B', 'C', 'D', 'E'];

  it('drags down onto a lower row (the bug): A onto D lands at D', () => {
    expect(run(base, 0, 3)).toEqual(['B', 'C', 'D', 'A', 'E']);
  });

  it('drags down onto the last row → moves to the bottom', () => {
    expect(run(base, 0, 4)).toEqual(['B', 'C', 'D', 'E', 'A']);
  });

  it('drags up onto a higher row: D onto B lands at B', () => {
    expect(run(base, 3, 1)).toEqual(['A', 'D', 'B', 'C', 'E']);
  });

  it('adjacent swap down', () => {
    expect(run(base, 1, 2)).toEqual(['A', 'C', 'B', 'D', 'E']);
  });

  it('no-op on same index or out of range', () => {
    expect(run(base, 2, 2)).toEqual(base);
    expect(run(base, 9, 1)).toEqual(base);
  });
});
