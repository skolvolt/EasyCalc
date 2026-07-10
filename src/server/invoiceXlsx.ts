import * as XLSXns from 'xlsx-js-style';
import type { ProjectState } from '../shared/types';

// xlsx-js-style ships a minified CJS bundle whose named exports aren't visible
// to Node's ESM lexer, so the real API arrives on `.default`. Normalise it.
const XLSX = ((XLSXns as unknown as { default?: typeof XLSXns }).default ?? XLSXns);
import {
  settingsOf, roomInvoiceLines, lmCategorySubtotals, roomSummary,
  roomTypeCounts, roomsOfType, projectTotals, type Settings,
} from '../shared/engine';
import type { DocKind } from './invoiceHtml';

// ---- palette mirrors the PDF (invoiceHtml.ts) ----
const ACCENT = '1256A0';
const HEAD_FILL = 'E8F0FA';
const TOTAL_FILL = 'F4F7FB';
const LINE = 'D5DCE4';
const MUTED = '67788E';
const MONEY_FMT = '$#,##0.00';

const thin = { style: 'thin', color: { rgb: LINE } };
const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
const RIGHT = { horizontal: 'right' } as const;

const ST = {
  title: { font: { bold: true, sz: 16, color: { rgb: ACCENT } } },
  meta: { font: { sz: 10, color: { rgb: MUTED } } },
  notes: { font: { sz: 10, italic: true, color: { rgb: MUTED } }, alignment: { wrapText: true, vertical: 'top' } },
  caption: { font: { bold: true, sz: 12, color: { rgb: ACCENT } } },
  head: { font: { bold: true, color: { rgb: '1A2433' } }, fill: { patternType: 'solid', fgColor: { rgb: HEAD_FILL } }, border: BORDER },
  headNum: { font: { bold: true, color: { rgb: '1A2433' } }, fill: { patternType: 'solid', fgColor: { rgb: HEAD_FILL } }, border: BORDER, alignment: RIGHT },
  cell: { border: BORDER },
  wrapCell: { border: BORDER, alignment: { wrapText: true, vertical: 'top' } },
  numCell: { border: BORDER, alignment: RIGHT },
  money: { border: BORDER, numFmt: MONEY_FMT, alignment: RIGHT },
  lineLbl: { border: BORDER },
  lineMoney: { border: BORDER, numFmt: MONEY_FMT, alignment: RIGHT },
  total: { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: TOTAL_FILL } }, border: BORDER },
  totalMoney: { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: TOTAL_FILL } }, border: BORDER, numFmt: MONEY_FMT, alignment: RIGHT },
};

type Val = string | number;
interface XCell { v: Val; s: object }
type Merge = { s: { r: number; c: number }; e: { r: number; c: number } };

/** Width (in chars) the money value needs once formatted as $#,##0.00. */
const moneyWidth = (n: number) => ('$' + Math.round(Math.abs(n)).toLocaleString('en-US')).length + 3;

/**
 * Fluent builder for one styled worksheet.
 *
 * Title/meta/caption rows are left UNMERGED so their text overflows into the
 * empty cells to the right (merging them to the narrow table width clips the
 * text). Column widths are grown from every row that carries real content —
 * including total/line rows — with a floor on money columns so values never
 * collapse to "####".
 */
function sheet(width: number) {
  const rows: XCell[][] = [];
  const merges: Merge[] = [];
  const colW = new Array(width).fill(0);
  const isMoney = new Array(width).fill(false);
  let notesRow: number | null = null;
  let notesLen = 0;

  const grow = (c: number, len: number, money = false) => {
    if (c < width) { colW[c] = Math.max(colW[c], len); if (money) isMoney[c] = true; }
  };
  const span = (r: number, from: number, to: number) => {
    if (to > from) merges.push({ s: { r, c: from }, e: { r, c: to } });
  };
  const filled = (label: Val, amount: Val, amountCol: number, lbl: object, amt: object): XCell[] => {
    const cells: XCell[] = [];
    for (let c = 0; c < width; c++) {
      cells.push({ v: c === 0 ? label : c === amountCol ? amount : '', s: c === amountCol ? amt : lbl });
    }
    return cells;
  };

  const api = {
    // unmerged banner rows — overflow into the empty cells beside them
    title(text: string) { rows.push([{ v: text, s: ST.title }]); return api; },
    caption(text: string) { rows.push([{ v: text, s: ST.caption }]); return api; },
    meta(text: string) { rows.push([{ v: text, s: ST.meta }]); return api; },
    notes(text: string) {
      notesRow = rows.length; notesLen = text.length;
      span(rows.length, 0, Math.max(width - 1, 5)); // wrap across a few columns
      rows.push([{ v: text, s: ST.notes }]);
      return api;
    },
    blank() { rows.push([]); return api; },
    head(labels: string[], numCols: Set<number>) {
      labels.forEach((l, i) => grow(i, l.length));
      rows.push(labels.map((l, i) => ({ v: l, s: numCols.has(i) ? ST.headNum : ST.head })));
      return api;
    },
    data(vals: Val[], moneyCols: Set<number>, numCols: Set<number>, wrapCols?: Set<number>) {
      vals.forEach((v, i) => {
        // multi-line (vertical list) cells size to their longest line
        const len = moneyCols.has(i)
          ? moneyWidth(Number(v))
          : Math.max(...String(v).split('\n').map((s) => s.length), 0);
        grow(i, len, moneyCols.has(i));
      });
      rows.push(vals.map((v, i) => ({
        v,
        s: moneyCols.has(i) ? ST.money : numCols.has(i) ? ST.numCell : wrapCols?.has(i) ? ST.wrapCell : ST.cell,
      })));
      return api;
    },
    /** A plain labelled amount row (e.g. an L&M subtotal or GST). */
    line(label: string, amount: number, amountCol: number) {
      grow(amountCol, moneyWidth(amount), true);
      if (amountCol === 1) grow(0, label.length); // label isn't merged on a 2-col sheet
      span(rows.length, 0, amountCol - 1);
      rows.push(filled(label, amount, amountCol, ST.lineLbl, ST.lineMoney));
      return api;
    },
    /** A bold, shaded total row. */
    total(label: string, amount: number, amountCol: number) {
      grow(amountCol, moneyWidth(amount), true);
      if (amountCol === 1) grow(0, label.length);
      span(rows.length, 0, amountCol - 1);
      rows.push(filled(label, amount, amountCol, ST.total, ST.totalMoney));
      return api;
    },
    build(): XLSXns.WorkSheet {
      const values = rows.map((r) => r.map((x) => x.v));
      const ws = XLSX.utils.aoa_to_sheet(values);
      rows.forEach((r, ri) =>
        r.forEach((x, ci) => {
          const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
          if (ws[addr]) ws[addr].s = x.s;
        }));
      ws['!merges'] = merges;
      ws['!cols'] = Array.from({ length: width }, (_, c) => ({
        wch: Math.min(54, Math.max(isMoney[c] ? 14 : 10, colW[c] + 2)),
      }));
      if (notesRow != null) {
        const rowHeights: { hpt: number }[] = [];
        rowHeights[notesRow] = { hpt: Math.min(96, Math.max(18, Math.ceil(notesLen / 80) * 15)) };
        ws['!rows'] = rowHeights;
      }
      return ws;
    },
  };
  return api;
}

const today = () => new Date().toLocaleDateString('en-AU');

/** Flatten rich-text (contentEditable HTML) notes to plain text for a cell. */
function htmlToText(html: string | null | undefined): string {
  return String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function metaLine(state: ProjectState): string {
  const d = state.details;
  const bits = [d.client_name || 'Client', `Date: ${today()}`];
  if (d.quoted_by) bits.push(`Quoted by: ${d.quoted_by}`);
  bits.push('Valid 30 days');
  return bits.join('    ·    ');
}

/** Company letterhead lines (name, then a combined contact line). */
function companyMeta(state: ProjectState): string[] {
  const d = state.details;
  const out: string[] = [];
  if (d.company_name) out.push(d.company_name);
  const contact = [d.company_address, d.company_phone && `Ph: ${d.company_phone}`, d.company_website]
    .filter(Boolean)
    .join('    ·    ');
  if (contact) out.push(contact);
  return out;
}

/** Title + company letterhead + client/date line for a sheet's header block. */
function heading(b: ReturnType<typeof sheet>, state: ProjectState, title: string) {
  b.title(title);
  for (const line of companyMeta(state)) b.meta(line);
  b.meta(metaLine(state));
  return b;
}

/** Safe, unique 31-char Excel sheet name. */
function safeSheetName(name: string, used: Set<string>): string {
  const base = (name || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${base} ${i++}`.slice(0, 31);
  used.add(candidate.toLowerCase());
  return candidate;
}

// ---- per-document sheet content ----

function fillRoomInvoice(b: ReturnType<typeof sheet>, state: ProjectState, s: Settings, typeIdx: number) {
  const rt = state.room_types.find((t) => t.idx === typeIdx);
  const count = roomTypeCounts(state)[typeIdx] ?? 0;
  const lines = roomInvoiceLines(state, s, typeIdx);
  const lmSubs = lmCategorySubtotals(state, s, typeIdx).filter((x) => x.amount > 0);
  const equipSubtotal = lines.reduce((a, l) => a + l.subtotal, 0);
  const exGst = equipSubtotal + lmSubs.reduce((a, l) => a + l.amount, 0);
  const rooms = roomsOfType(state, typeIdx).join(', ') || '—';

  b.caption(`${rt?.name ?? 'Room'} — ${count} room(s)`);
  b.meta(`Rooms: ${rooms}  ·  Prices per room`);
  const rtNotes = htmlToText(rt?.notes);
  if (rtNotes) b.notes(rtNotes);
  b.blank();
  b.head(['Qty', 'Part / Model', 'Description', 'Unit Price', 'Subtotal'], new Set([0, 3, 4]));
  for (const l of lines) b.data([l.qty, l.partModel, l.description, l.unitSell, l.subtotal], new Set([3, 4]), new Set([0]));
  b.total('SUB-TOTAL — Equipment', equipSubtotal, 4);
  for (const x of lmSubs) b.line(x.name, x.amount, 4);
  b.total('Total Cost Per Room Excluding GST', exGst, 4);
}

function fillRoomSummary(b: ReturnType<typeof sheet>, state: ProjectState, s: Settings) {
  const sum = roomSummary(state, s);
  const rows = sum.rows.filter((r) => r.quantity > 0 || r.perRoom > 0);
  b.head(['Room Type', 'Rooms', 'Quantity', 'Cost per Room', 'Total Cost'], new Set([2, 3, 4]));
  for (const r of rows) {
    const rooms = roomsOfType(state, r.typeIdx).join('\n') || '—';
    b.data([r.name, rooms, r.quantity, r.perRoom, r.total], new Set([3, 4]), new Set([2]), new Set([1]));
  }
  b.total('Total Invoice (Excluding GST)', sum.exGst, 4);
  b.line('GST', sum.gst, 4);
  b.total('Total Invoice (Including GST)', sum.incGst, 4);
}

function fillProjectTotals(b: ReturnType<typeof sheet>, state: ProjectState, s: Settings) {
  const t = projectTotals(state, s);
  const lmSubs = lmCategorySubtotals(state, s, null).filter((x) => x.amount > 0);
  const gst = t.revenue * s.gst;
  b.head(['Item', 'Amount'], new Set([1]));
  b.total('Equipment', t.equipmentRevenue, 1);
  for (const x of lmSubs) b.line(`Labour & Materials — ${x.name}`, x.amount, 1);
  b.total('Total (Excluding GST)', t.revenue, 1);
  b.line('GST', gst, 1);
  b.total('Total (Including GST)', t.revenue + gst, 1);
}

/** Build a styled .xlsx workbook for an invoice document. */
export function renderWorkbook(state: ProjectState, doc: DocKind): { title: string; buffer: Buffer } {
  const s = settingsOf(state);
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const add = (name: string, ws: XLSXns.WorkSheet) =>
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name, used));

  let title: string;
  if (doc.kind === 'summary') {
    title = 'Room Summary';
    const b = heading(sheet(5), state, 'Room Summary');
    b.blank();
    fillRoomSummary(b, state, s);
    add('Room Summary', b.build());
  } else if (doc.kind === 'room') {
    const rt = state.room_types.find((t) => t.idx === doc.typeIdx);
    title = `Room Invoice — ${rt?.name ?? ''}`;
    const b = heading(sheet(5), state, 'Room Invoice');
    b.blank();
    fillRoomInvoice(b, state, s, doc.typeIdx); // adds this room's own notes
    add(rt?.name ?? 'Room', b.build());
  } else if (doc.kind === 'matrix') {
    title = 'Room Matrix';
    const types = state.room_types;
    const d = state.details;
    const b = sheet(3 + Math.max(types.length, 1));
    b.title('Room Matrix');
    for (const line of companyMeta(state)) b.meta(line);
    // meta line WITHOUT any quote/expiry — a site working document.
    const bits = [d.client_name || 'Client'];
    if (d.client_site) bits.push(`Site: ${d.client_site}`);
    bits.push(`Date: ${today()}`);
    if (d.project_name) bits.push(String(d.project_name));
    if (d.project_number) bits.push(`#${d.project_number}`);
    b.meta(bits.join('    ·    '));
    b.blank();
    const numCols = new Set(types.map((_, i) => 3 + i));
    b.head(['Level', 'Area', 'Room No.', ...types.map((t) => t.name)], numCols);
    const counts = roomTypeCounts(state);
    const qtyFor = (room: ProjectState['rooms'][number], idx: number) =>
      room.types.find((t) => t.type_idx === idx)?.qty;
    for (const room of state.rooms) {
      b.data(
        [room.level ?? '', room.area ?? '', room.room_no ?? '', ...types.map((t) => qtyFor(room, t.idx) ?? '')],
        new Set(), numCols,
      );
    }
    b.data(['Total rooms per type', '', '', ...types.map((t) => counts[t.idx] || '')], new Set(), numCols);
    add('Room Matrix', b.build());
  } else {
    title = 'Total Project Invoice';
    const totalsB = heading(sheet(2), state, 'Total Project Invoice');
    totalsB.blank();
    fillProjectTotals(totalsB, state, s);
    add('Project Totals', totalsB.build());

    const summaryB = sheet(5).title('Room Summary').blank();
    fillRoomSummary(summaryB, state, s);
    add('Room Summary', summaryB.build());

    const counts = roomTypeCounts(state);
    for (const rt of state.room_types.filter((r) => (counts[r.idx] ?? 0) > 0)) {
      const b = sheet(5);
      fillRoomInvoice(b, state, s, rt.idx);
      add(rt.name, b.build());
    }
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return { title, buffer };
}
