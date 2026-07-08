import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSXns from 'xlsx-js-style';
import { importCatalogue } from '../src/server/catalogueImport';
import { checkPricelist } from '../src/server/pricelist';

// exercises the xlsx -> xlsx-js-style read swap (import + pricelist
// both dropped the separate `xlsx` package in favour of this one).
const XLSX = ((XLSXns as unknown as { default?: typeof XLSXns }).default ?? XLSXns);

const dir = dirname(fileURLToPath(import.meta.url));
const file = join(dir, '__tmp_pricelist.xlsx');

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ['Description', 'Part #', 'Cost'],
  ['Widget A', 'PN-1', 12.5],
  ['Widget B', 'PN-2', 7],
]);
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

afterAll(() => unlinkSync(file));

describe('xlsx-js-style read path', () => {
  it('importCatalogue maps columns and rows', () => {
    const { items } = importCatalogue(file);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ description: 'Widget A', part_number: 'PN-1', cost: 12.5 });
  });

  it('checkPricelist matches by part number', () => {
    const { matches } = checkPricelist(file, [
      { row: 1, part_number: 'PN-2', description: null, cost: 0 },
    ]);
    expect(matches).toEqual([
      expect.objectContaining({ itemRow: 1, matchedOn: 'part_number', newPrice: 7 }),
    ]);
  });
});
