import { existsSync, readFileSync } from 'node:fs';
import * as XLSXns from 'xlsx-js-style';
import type { LmItem, LmKind } from '../shared/types';

// Same spreadsheet dep as catalogueImport (xlsx-js-style; real API on .default).
const XLSX = ((XLSXns as unknown as { default?: typeof XLSXns }).default ?? XLSXns);

/** Header keywords → Labour & Materials field. First matching column wins. */
const COLUMN_KEYS: { field: keyof MappedRow; re: RegExp }[] = [
  { field: 'category', re: /category|section|group|discipline/i },
  { field: 'component', re: /component|task|labour|labor|work|item|description|element/i },
  { field: 'particular', re: /particular|detail|sub|role|type/i },
  { field: 'brand', re: /brand|make|manufactur|supplier|vendor/i },
  { field: 'measurement', re: /measure|uom|unit\b|per\b/i },
  { field: 'cost', re: /cost|rate|buy|nett?|trade|wholesale/i },
  { field: 'sell', re: /sell|charge|retail|price|quote/i },
  { field: 'markup', re: /mark\s*up|margin/i },
];

interface MappedRow {
  category?: string;
  component?: string;
  particular?: string;
  brand?: string;
  measurement?: string;
  cost?: number;
  sell?: number;
  markup?: number;
}

const asText = (v: unknown) => (v == null ? '' : String(v).trim());
const asNum = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
};

/** Best-effort kind from the category/measurement text. */
function kindOf(category: string, measurement: string): LmKind {
  if (/cable|wire|cabl/i.test(category)) return 'cable';
  if (/part|material|hardware|consumable/i.test(category)) return 'part';
  if (/hour|hr\b|day|labour|labor/i.test(measurement) || /labour|labor|design|install|programming|commission|management|engineering/i.test(category)) return 'labour';
  return 'part';
}

/**
 * Import a Labour & Materials list from an .xlsx/.csv, mapping columns to L&M
 * fields by header keywords (best-effort, like the equipment import). Labour
 * rows carry a sell price; cable/part rows carry a mark-up.
 */
export function importLm(file: string): { items: LmItem[]; mapped: string[] } {
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  const wb = XLSX.read(readFileSync(file), { type: 'buffer' });

  for (const sheetName of wb.SheetNames) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true });
    if (rows.length < 2) continue;

    let headerRow = -1;
    let colMap: Partial<Record<number, keyof MappedRow>> = {};
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const map: Partial<Record<number, keyof MappedRow>> = {};
      const taken = new Set<string>();
      (rows[r] ?? []).forEach((cell, c) => {
        const text = asText(cell);
        if (!text) return;
        for (const { field, re } of COLUMN_KEYS) {
          if (taken.has(field)) continue;
          if (re.test(text)) { map[c] = field; taken.add(field); break; }
        }
      });
      if (Object.keys(map).length >= 2 && taken.has('component')) {
        headerRow = r; colMap = map; break;
      }
    }
    if (headerRow < 0) continue;

    const items: LmItem[] = [];
    let rowId = 1;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => asText(c) === '')) continue;
      const m: MappedRow = {};
      for (const [cStr, field] of Object.entries(colMap)) {
        if (!field) continue;
        const v = row[Number(cStr)];
        if (field === 'cost' || field === 'sell' || field === 'markup') {
          const n = asNum(v);
          if (n != null) (m as any)[field] = n;
        } else {
          const t = asText(v);
          if (t) (m as any)[field] = t;
        }
      }
      if (!m.component) continue; // skip rows with no identity

      const category = m.category ?? 'Installation';
      const kind = kindOf(category, m.measurement ?? '');
      const cost = m.cost ?? null;
      const isLabour = kind === 'labour';
      items.push({
        row: rowId++,
        kind,
        category,
        component: m.component ?? '',
        particular: m.particular ?? '',
        brand: m.brand ?? null,
        measurement: m.measurement ?? (isLabour ? 'Per Hour' : 'Per Item'),
        cost,
        markup_entered: isLabour ? null : (m.markup ?? (m.sell && cost ? m.sell / cost - 1 : 0.45)),
        sell_entered: isLabour ? (m.sell ?? (cost ?? 0) * (1 + (m.markup ?? 0))) : null,
        allocations: {},
      });
    }

    if (items.length) {
      const mapped = [...new Set(Object.values(colMap) as string[])];
      return { items, mapped };
    }
  }
  throw new Error('No labour/materials rows found. Expected a header row with columns like Component, Category, Cost, Sell.');
}
