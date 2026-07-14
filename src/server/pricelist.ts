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
  /** Header of the column the new price was taken from — for cross-checking. */
  priceHeader?: string;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

// Columns that hold a price (any tier — trade, nett, premium, special, rrp…).
const PRICE_HEADER = /cost|trade|buy|nett|net\s*price|dealer|wholesale|price|premium|special|rrp|list|sell/i;
// Numeric columns that look price-ish but aren't a unit price.
const NON_PRICE = /\b(qty|quantity|disc(ount)?|margin|weight|moq|pack|ea)\b/i;
// GST-inclusive columns — skipped so we compare ex-GST prices to each other.
const isIncGst = (h: string) =>
  /incl/i.test(h) || /gst\s*inc/i.test(h) || ((/\binc\b/i.test(h) || /inc\./i.test(h)) && /gst/i.test(h));

/**
 * Exact word-for-word matching, as specified: a pricelist row matches a
 * catalogue item when any cell equals the item's part number or description
 * (case/whitespace-insensitive). For the price, we gather every price-headed
 * column, drop GST-inclusive ones, and take the CHEAPEST ex-GST value in the
 * matched row (so e.g. a lower "Special"/"Premium" price wins over trade).
 * Falls back to the right-most positive number when no price header is found.
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

    // find price columns (and their headers) from the first few rows' headers
    const priceCols = new Set<number>();
    const incGstCols = new Set<number>();
    const colHeader = new Map<number, string>();
    for (const row of rows.slice(0, 8)) {
      row?.forEach((cell, c) => {
        if (typeof cell !== 'string') return;
        if (PRICE_HEADER.test(cell) && !NON_PRICE.test(cell)) {
          priceCols.add(c);
          colHeader.set(c, cell.trim());
          if (isIncGst(cell)) incGstCols.add(c);
        }
      });
    }
    // ex-GST price columns preferred; if a sheet only has inc-GST, use those.
    const exGstCols = [...priceCols].filter((c) => !incGstCols.has(c));
    const pickFrom = exGstCols.length ? exGstCols : [...priceCols];

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

        // cheapest positive value among the (ex-GST) price columns for this row
        let price: number | null = null;
        let priceCol = -1;
        for (const c of pickFrom) {
          const v = row[c];
          if (typeof v === 'number' && v > 0 && (price === null || v < price)) {
            price = v;
            priceCol = c;
          }
        }
        if (price === null) {
          // no recognised price column — right-most positive number as a last resort
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
          priceHeader: priceCol >= 0 ? colHeader.get(priceCol) : undefined,
        });
      }
    }
  }
  return { matches, scannedSheets: wb.SheetNames };
}
