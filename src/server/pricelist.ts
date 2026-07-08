import { existsSync, readFileSync } from 'node:fs';
import * as XLSXns from 'xlsx-js-style';

// same dedup as catalogueImport.ts — one spreadsheet dep, not two.
const XLSX = ((XLSXns as unknown as { default?: typeof XLSXns }).default ?? XLSXns);

export interface PricelistItemQuery {
  row: number; // catalogue row id
  part_number: string | null;
  description: string | null;
  cost: number | null;
}

export interface PriceMatch {
  itemRow: number;
  matchedOn: 'part_number' | 'description';
  matchedText: string;
  sheet: string;
  currentCost: number | null;
  newPrice: number;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

const PRICE_HEADER = /(cost|trade|buy|nett?\s*price|dealer|price)/i;

/**
 * Exact word-for-word matching, as specified: a pricelist row matches a
 * catalogue item when any cell equals the item's part number or description
 * (case/whitespace-insensitive). Price detection prefers columns whose header
 * mentions cost/trade/buy/net/dealer/price; falls back to the right-most
 * positive number in the matched row.
 */
export function checkPricelist(
  file: string,
  items: PricelistItemQuery[],
): { matches: PriceMatch[]; scannedSheets: string[] } {
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
  const matches: PriceMatch[] = [];
  const matchedItems = new Set<number>();

  const wanted = items
    .map((it) => ({
      ...it,
      pn: norm(it.part_number),
      desc: norm(it.description),
    }))
    .filter((it) => it.pn || it.desc);

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    if (!rows.length) continue;

    // find price-preferred columns from the first few rows' headers
    const priceCols = new Set<number>();
    for (const row of rows.slice(0, 6)) {
      row?.forEach((cell, c) => {
        if (typeof cell === 'string' && PRICE_HEADER.test(cell)) priceCols.add(c);
      });
    }

    for (const row of rows) {
      if (!row) continue;
      const cellNorms = row.map(norm);
      for (const it of wanted) {
        if (matchedItems.has(it.row)) continue;
        let matchedOn: PriceMatch['matchedOn'] | null = null;
        let matchedText = '';
        if (it.pn) {
          // items with a part number match on part number ONLY — catalogue
          // descriptions are reused across variants and would mis-price them
          if (cellNorms.includes(it.pn)) {
            matchedOn = 'part_number';
            matchedText = it.part_number!;
          }
        } else if (it.desc && cellNorms.includes(it.desc)) {
          matchedOn = 'description';
          matchedText = it.description!;
        }
        if (!matchedOn) continue;

        let price: number | null = null;
        for (const c of priceCols) {
          const v = row[c];
          if (typeof v === 'number' && v > 0) { price = v; break; }
        }
        if (price === null) {
          for (let c = row.length - 1; c >= 0; c--) {
            const v = row[c];
            if (typeof v === 'number' && v > 0) { price = v; break; }
          }
        }
        if (price === null) continue;

        matchedItems.add(it.row);
        matches.push({
          itemRow: it.row,
          matchedOn,
          matchedText,
          sheet: sheetName,
          currentCost: it.cost,
          newPrice: price,
        });
      }
    }
  }
  return { matches, scannedSheets: wb.SheetNames };
}
