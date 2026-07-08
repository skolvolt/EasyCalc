import { existsSync, readFileSync } from 'node:fs';
import * as XLSXns from 'xlsx-js-style';
import type { CatalogueItem } from '../shared/types';

// xlsx-js-style is a superset fork of xlsx (same read API, adds
// write styling) already used by invoiceXlsx.ts — one spreadsheet dep instead
// of two. Its CJS bundle puts the real API on `.default` under Node ESM.
const XLSX = ((XLSXns as unknown as { default?: typeof XLSXns }).default ?? XLSXns);

/** Header keywords → catalogue field. First matching column wins. */
const COLUMN_KEYS: { field: keyof MappedRow; re: RegExp }[] = [
  { field: 'part_number', re: /part\s*(no|#|number)|model|sku|catalog|code/i },
  { field: 'description', re: /desc|item|product|equipment|name/i },
  { field: 'manufacturer', re: /manufactur|brand|make|mfr|mfg/i },
  { field: 'supplier', re: /supplier|vendor|distributor|reseller/i },
  { field: 'section', re: /category|section|group|system|type/i },
  { field: 'subcategory', re: /sub\s*(category|group|section)/i },
  { field: 'measurement', re: /measure|uom|unit\b/i },
  { field: 'cost', re: /cost|buy|trade|nett?|dealer|wholesale|price/i },
  { field: 'markup', re: /mark\s*up|margin/i },
];

interface MappedRow {
  part_number?: string;
  description?: string;
  manufacturer?: string;
  supplier?: string;
  section?: string;
  subcategory?: string;
  measurement?: string;
  cost?: number;
  markup?: number;
}

const asText = (v: unknown) => (v == null ? '' : String(v).trim());
const asNum = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
};

/**
 * Import an equipment list from an .xlsx/.csv, mapping columns to catalogue
 * fields by their header keywords. Detects the header row as the first row
 * with at least two recognised columns; rows below it become catalogue items.
 */
export function importCatalogue(file: string): { items: CatalogueItem[]; mapped: string[] } {
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  const wb = XLSX.read(readFileSync(file), { type: 'buffer' });

  for (const sheetName of wb.SheetNames) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true });
    if (rows.length < 2) continue;

    // find the header row + column→field mapping
    let headerRow = -1;
    let colMap: Partial<Record<number, keyof MappedRow>> = {};
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const map: Partial<Record<number, keyof MappedRow>> = {};
      const takenFields = new Set<string>();
      (rows[r] ?? []).forEach((cell, c) => {
        const text = asText(cell);
        if (!text) return;
        for (const { field, re } of COLUMN_KEYS) {
          if (takenFields.has(field)) continue;
          if (re.test(text)) { map[c] = field; takenFields.add(field); break; }
        }
      });
      if (Object.keys(map).length >= 2 && (takenFields.has('description') || takenFields.has('part_number'))) {
        headerRow = r;
        colMap = map;
        break;
      }
    }
    if (headerRow < 0) continue;

    const items: CatalogueItem[] = [];
    let rowId = 1;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => asText(c) === '')) continue;
      const m: MappedRow = {};
      for (const [cStr, field] of Object.entries(colMap)) {
        if (!field) continue;
        const v = row[Number(cStr)];
        if (field === 'cost' || field === 'markup') {
          const n = asNum(v);
          if (n != null) (m as any)[field] = n;
        } else {
          const t = asText(v);
          if (t) (m as any)[field] = t;
        }
      }
      if (!m.description && !m.part_number) continue; // skip rows with no identity
      items.push({
        row: rowId++,
        section: m.section ?? 'Imported',
        subcategory: m.subcategory ?? null,
        description: m.description ?? '',
        part_number: m.part_number ?? '',
        power_load: null,
        dimensions: null,
        warranty: null,
        manufacturer: m.manufacturer ?? '',
        supplier: m.supplier ?? '',
        measurement: m.measurement ?? 'per item',
        cost: m.cost ?? null,
        markup: m.markup ?? 0.25,
        allocations: {},
      });
    }

    if (items.length) {
      const mapped = [...new Set(Object.values(colMap) as string[])];
      return { items, mapped };
    }
  }
  throw new Error('No equipment rows found. Expected a header row with columns like Description, Part #, Brand, Supplier, Cost.');
}
