import type { CatalogueItem, LmItem, ProjectState } from './types';

// Calculation engine — faithful port of the workbook formula chains.
// References below are to the original xlsm (see PROJECT-MODEL-AUDIT.md).

export const EQUIPMENT_CATEGORY = 'Equipment';

export interface Settings {
  gst: number;
  /** Details!C33 — added to every Schedule item markup */
  equipmentContingency: number;
  /** Details!B33:C42 — per-category contingency for Labour&Materials */
  categoryContingency: Map<string, number>;
}

export function settingsOf(state: ProjectState): Settings {
  return {
    gst: state.details.gst ?? 0.1,
    equipmentContingency:
      state.categories.find((c) => c.name === EQUIPMENT_CATEGORY)?.contingency ?? 0,
    categoryContingency: new Map(state.categories.map((c) => [c.name, c.contingency ?? 0])),
  };
}

/** Room!E117:O117 — count of rooms per type. */
export function roomTypeCounts(state: ProjectState): number[] {
  const counts = state.room_types.map(() => 0);
  for (const room of state.rooms)
    for (const t of room.types) if (t.type_idx < counts.length) counts[t.type_idx] += t.qty;
  return counts;
}

/** Best label for a physical room — its number, else area, else level. */
export function roomLabel(room: ProjectState['rooms'][number]): string {
  const pick = (v: unknown) => (v == null ? '' : String(v).trim());
  return pick(room.room_no) || pick(room.area) || pick(room.level);
}

/** Labels of the physical rooms assigned to a given system type. */
export function roomsOfType(state: ProjectState, typeIdx: number): string[] {
  return state.rooms
    .filter((r) => r.types.some((t) => t.type_idx === typeIdx))
    .map(roomLabel)
    .filter(Boolean);
}

// ---- Schedule items -------------------------------------------------------

/** Schedule!L — markup + equipment contingency */
export function itemMarkupWithContingency(item: CatalogueItem, s: Settings): number {
  return (item.markup ?? 0) + s.equipmentContingency;
}

/** Schedule!N = Cost × (1 + markup-with-contingency) */
export function itemSell(item: CatalogueItem, s: Settings): number {
  return (item.cost ?? 0) * (1 + itemMarkupWithContingency(item, s));
}

/** Schedule!M = (Sell − Cost) / Sell, 0-guarded */
export function itemMargin(item: CatalogueItem, s: Settings): number {
  const sell = itemSell(item, s);
  return sell === 0 ? 0 : (sell - (item.cost ?? 0)) / sell;
}

/** Schedule!O = Σ allocation[type] × roomCount[type] */
export function itemQty(item: CatalogueItem, counts: number[]): number {
  let q = 0;
  for (const [idx, per] of Object.entries(item.allocations)) q += per * (counts[+idx] ?? 0);
  return q;
}

// ---- Labour & Materials ---------------------------------------------------

export interface LmDerived {
  markup: number;
  markupWithContingency: number;
  margin: number;
  sell: number;
}

/**
 * Labour rows enter Sell directly (markup derived: Sell/Cost − 1, shown net of
 * category contingency). Cable/Part rows enter markup (sell derived:
 * Cost × (1 + markup + category contingency)).
 */
export function lmDerived(item: LmItem, s: Settings): LmDerived {
  const cost = item.cost ?? 0;
  const cont = s.categoryContingency.get(item.category ?? '') ?? 0;
  if (item.kind === 'labour') {
    const sell = item.sell_entered ?? 0;
    const markupWithContingency = cost === 0 ? 0 : sell / cost - 1;
    return {
      markup: markupWithContingency - cont,
      markupWithContingency,
      margin: sell === 0 ? 0 : (sell - cost) / sell,
      sell,
    };
  }
  const markup = item.markup_entered ?? 0;
  const markupWithContingency = markup + cont;
  const sell = cost * (1 + markupWithContingency);
  return {
    markup,
    markupWithContingency,
    margin: sell === 0 ? 0 : (sell - cost) / sell,
    sell,
  };
}

/**
 * Labour & Materials quantity is the sum of the row's allocation entries (the
 * numbers to the right of the Sell column), per the app's L&M convention —
 * these are treated as absolute quantities, not per-room multipliers. `counts`
 * is accepted for call-site symmetry with itemQty but intentionally unused.
 */
export function lmQty(item: LmItem, _counts?: number[]): number {
  let q = 0;
  for (const per of Object.values(item.allocations)) q += per;
  return q;
}

// ---- Rollups ---------------------------------------------------------------

export interface PerType {
  equipmentCost: number[];
  equipmentSell: number[];
  lmCost: number[];
  lmSell: number[];
  totalCost: number[];
  totalSell: number[];
  power: number[];
}

/** Room!E125:N133 — per-room-type cost/revenue (per ONE room of the type). */
export function perRoomType(state: ProjectState, s: Settings): PerType {
  const n = state.room_types.length;
  const z = () => new Array<number>(n).fill(0);
  const out: PerType = {
    equipmentCost: z(), equipmentSell: z(), lmCost: z(), lmSell: z(),
    totalCost: z(), totalSell: z(), power: z(),
  };
  for (const item of state.catalogue) {
    const sell = itemSell(item, s);
    for (const [idx, per] of Object.entries(item.allocations)) {
      const t = +idx;
      if (t >= n) continue;
      out.equipmentCost[t] += (item.cost ?? 0) * per;
      out.equipmentSell[t] += sell * per;
      out.power[t] += (item.power_load ?? 0) * per;
    }
  }
  for (const item of state.labour_materials) {
    const { sell } = lmDerived(item, s);
    for (const [idx, per] of Object.entries(item.allocations)) {
      const t = +idx;
      if (t >= n) continue;
      out.lmCost[t] += (item.cost ?? 0) * per;
      out.lmSell[t] += sell * per;
    }
  }
  for (let t = 0; t < n; t++) {
    out.totalCost[t] = out.equipmentCost[t] + out.lmCost[t];
    out.totalSell[t] = out.equipmentSell[t] + out.lmSell[t];
  }
  return out;
}

export interface Totals {
  equipmentRevenue: number;
  equipmentCost: number;
  lmRevenue: number;
  lmCost: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  margin: number;
}

/** Details!F26:H29 */
export function projectTotals(state: ProjectState, s: Settings): Totals {
  const counts = roomTypeCounts(state);
  let eqRev = 0, eqCost = 0, lmRev = 0, lmCost = 0;
  for (const item of state.catalogue) {
    const qty = itemQty(item, counts);
    eqRev += itemSell(item, s) * qty;
    eqCost += (item.cost ?? 0) * qty;
  }
  for (const item of state.labour_materials) {
    const qty = lmQty(item, counts);
    lmRev += lmDerived(item, s).sell * qty;
    lmCost += (item.cost ?? 0) * qty;
  }
  const revenue = eqRev + lmRev;
  const cost = eqCost + lmCost;
  return {
    equipmentRevenue: eqRev, equipmentCost: eqCost,
    lmRevenue: lmRev, lmCost,
    revenue, cost,
    grossProfit: revenue - cost,
    margin: revenue === 0 ? 0 : (revenue - cost) / revenue,
  };
}

export interface CategoryLine {
  name: string;
  contingency: number;
  revenue: number;
  hours: number;
  cost: number;
  grossProfit: number;
  margin: number;
}

/** Details!B32:H43 — per-category P&L (Equipment row + L&M categories). */
export function categoryBreakdown(state: ProjectState, s: Settings): CategoryLine[] {
  const counts = roomTypeCounts(state);
  const totals = projectTotals(state, s);
  return state.categories.map((cat) => {
    if (cat.name === EQUIPMENT_CATEGORY) {
      const gp = totals.equipmentRevenue - totals.equipmentCost;
      return {
        name: cat.name, contingency: cat.contingency,
        revenue: totals.equipmentRevenue, hours: 0, cost: totals.equipmentCost,
        grossProfit: gp,
        margin: totals.equipmentRevenue === 0 ? 0 : gp / totals.equipmentRevenue,
      };
    }
    let revenue = 0, cost = 0, hours = 0;
    for (const item of state.labour_materials) {
      if ((item.category ?? '').trim() !== cat.name.trim()) continue;
      const qty = lmQty(item, counts);
      revenue += lmDerived(item, s).sell * qty;
      cost += (item.cost ?? 0) * qty;
      if (item.kind === 'labour') hours += qty;
    }
    const gp = revenue - cost;
    return {
      name: cat.name, contingency: cat.contingency,
      revenue, hours, cost, grossProfit: gp,
      margin: revenue === 0 ? 0 : gp / revenue,
    };
  });
}

// ---- Invoices --------------------------------------------------------------

export interface InvoiceLine {
  qty: number;
  partModel: string;
  description: string;
  unitSell: number;
  subtotal: number;
}

/** Room Invoice body — items allocated to one room type (per single room). */
export function roomInvoiceLines(state: ProjectState, s: Settings, typeIdx: number): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  for (const item of state.catalogue) {
    const per = item.allocations[String(typeIdx)] ?? 0;
    if (per <= 0) continue;
    const sell = itemSell(item, s);
    lines.push({
      qty: per,
      partModel: [item.manufacturer, item.part_number].filter(Boolean).join(' '),
      description: item.description ?? '',
      unitSell: sell,
      subtotal: sell * per,
    });
  }
  return lines;
}

/** Total Invoice body — all items with project-wide qty > 0. */
export function totalInvoiceLines(state: ProjectState, s: Settings): InvoiceLine[] {
  const counts = roomTypeCounts(state);
  const lines: InvoiceLine[] = [];
  for (const item of state.catalogue) {
    const qty = itemQty(item, counts);
    if (qty <= 0) continue;
    const sell = itemSell(item, s);
    lines.push({
      qty,
      partModel: [item.manufacturer, item.part_number].filter(Boolean).join(' '),
      description: item.description ?? '',
      unitSell: sell,
      subtotal: sell * qty,
    });
  }
  return lines;
}

/** Per-category L&M sell subtotal for one room type (Room Invoice L&M block). */
export function lmCategorySubtotals(
  state: ProjectState, s: Settings, typeIdx: number | null,
): { name: string; amount: number }[] {
  const counts = roomTypeCounts(state);
  return state.categories
    .filter((c) => c.name !== EQUIPMENT_CATEGORY)
    .map((cat) => {
      let amount = 0;
      for (const item of state.labour_materials) {
        if ((item.category ?? '').trim() !== cat.name.trim()) continue;
        const qty = typeIdx === null
          ? lmQty(item, counts)
          : item.allocations[String(typeIdx)] ?? 0;
        amount += lmDerived(item, s).sell * qty;
      }
      return { name: cat.name, amount };
    });
}

export interface RoomSummaryRow {
  typeIdx: number;
  name: string;
  quantity: number;
  perRoom: number; // sell per room (client-facing "cost per room")
  total: number;
}

/** Room Summary sheet. */
export function roomSummary(state: ProjectState, s: Settings) {
  const counts = roomTypeCounts(state);
  const per = perRoomType(state, s);
  const rows: RoomSummaryRow[] = state.room_types.map((rt) => ({
    typeIdx: rt.idx,
    name: rt.name,
    quantity: counts[rt.idx] ?? 0,
    perRoom: per.totalSell[rt.idx] ?? 0,
    total: (counts[rt.idx] ?? 0) * (per.totalSell[rt.idx] ?? 0),
  }));
  const exGst = rows.reduce((a, r) => a + r.total, 0);
  const gst = exGst * s.gst;
  return { rows, exGst, gst, incGst: exGst + gst };
}

// ---- Procurement ------------------------------------------------------------

export interface ProcurementLine {
  supplier: string;
  manufacturer: string;
  qty: number;
  partNumber: string;
  description: string;
  unitCost: number;
  unitSell: number;
  totalCost: number;
}

/**
 * Procurement list: every used item as its own row, sorted alphabetically by
 * supplier (then manufacturer / part) so the whole buy list reads A→Z.
 */
export function procurement(state: ProjectState, s: Settings): ProcurementLine[] {
  const counts = roomTypeCounts(state);
  const lines: ProcurementLine[] = [];
  for (const item of state.catalogue) {
    const qty = itemQty(item, counts);
    if (qty <= 0) continue;
    lines.push({
      supplier: item.supplier ?? '(none)',
      manufacturer: item.manufacturer ?? '',
      qty,
      partNumber: item.part_number ?? '',
      description: item.description ?? '',
      unitCost: item.cost ?? 0,
      unitSell: itemSell(item, s),
      totalCost: (item.cost ?? 0) * qty,
    });
  }
  return lines.sort(
    (a, b) =>
      a.supplier.localeCompare(b.supplier) ||
      a.manufacturer.localeCompare(b.manufacturer) ||
      a.partNumber.localeCompare(b.partNumber),
  );
}
