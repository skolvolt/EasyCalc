import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSXns from 'xlsx-js-style';
import { checkPricelist } from '../src/server/pricelist';

const XLSX = ((XLSXns as unknown as { default?: typeof XLSXns }).default ?? XLSXns);
const dir = dirname(fileURLToPath(import.meta.url));
const file = join(dir, '__tmp_cheapest.xlsx');

// Columns: two ex-GST tiers (Trade / Special) and one inc-GST column.
// The cheapest ex-GST value should win — even when it isn't the first column.
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ['Part No', 'Qty', 'Trade Ex GST', 'Special Ex GST', 'Price Inc GST'],
  ['ABC123', 1, 100, 80, 110],   // cheapest ex-GST is 80 (Special)
  ['XYZ999', 1, 55, 60, 66],     // cheapest ex-GST is 55 (Trade)
]);
XLSX.utils.book_append_sheet(wb, ws, 'Prices');
writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

afterAll(() => unlinkSync(file));

describe('pricelist: cheapest ex-GST selection', () => {
  it('picks the lowest ex-GST price and ignores the inc-GST column', () => {
    const { matches } = checkPricelist(file, [
      { row: 1, part_number: 'ABC123', description: null, cost: 200 },
      { row: 2, part_number: 'XYZ999', description: null, cost: 200 },
    ]);
    const a = matches.find((m) => m.itemRow === 1)!;
    const b = matches.find((m) => m.itemRow === 2)!;
    expect(a.newPrice).toBe(80);
    expect(a.priceHeader).toBe('Special Ex GST'); // reports the source column
    expect(b.newPrice).toBe(55);
    // never the inc-GST column
    expect(matches.every((m) => m.newPrice !== 110 && m.newPrice !== 66)).toBe(true);
  });
});
