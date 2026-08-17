import type { ProjectState } from '../shared/types';
import {
  settingsOf, roomInvoiceLines, lmCategorySubtotals,
  roomSummary, roomTypeCounts, roomsOfType, levelsOfType, projectTotals, procurement, type Settings,
} from '../shared/engine';

const fmtMoney = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 });

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Rooms rendered one-per-line (vertical list), or an em-dash when none. */
const roomsList = (rooms: string[]) =>
  rooms.length ? rooms.map((r) => `<div>${esc(r)}</div>`).join('') : '—';

export type DocKind =
  | { kind: 'summary' }
  | { kind: 'total' }
  | { kind: 'room'; typeIdx: number }
  | { kind: 'matrix' }
  | { kind: 'workbook' }
  | { kind: 'procurement' };

/** quote = full quote (expiry, client). working = BoM/workbook (no client, no
 *  expiry). matrix = site document: project + client details, no pricing/expiry. */
type HeaderMode = 'quote' | 'working' | 'matrix';

/** Default validity when a project hasn't set its own quote expiry. */
const QUOTE_VALIDITY_DAYS = 30;

function header(title: string, state: ProjectState, mode: HeaderMode): string {
  const d = state.details;
  const validDays = d.quote_expiry_days ?? QUOTE_VALIDITY_DAYS;
  const now = new Date();
  const expiry = new Date(now.getTime() + validDays * 24 * 3600 * 1000);
  const fmtDate = (dt: Date) => dt.toLocaleDateString('en-AU');

  const letterhead = `<div class="letterhead">
    ${d.company_logo ? `<img src="${d.company_logo}" class="logo">` : ''}
    ${d.company_name ? `<h2>${esc(d.company_name)}</h2>` : ''}
    ${d.company_address ? `<div>${esc(d.company_address)}</div>` : ''}
    ${d.company_phone ? `<div>Ph: ${esc(d.company_phone)}</div>` : ''}
    ${d.company_website ? `<div>${esc(d.company_website)}</div>` : ''}
  </div>`;

  const right = mode === 'quote'
    ? `<div class="right"><h1>${esc(title)}</h1>
        <div>Date: ${fmtDate(now)}</div>
        ${d.quoted_by ? `<div>Quoted by: ${esc(d.quoted_by)}</div>` : ''}
        <div>Valid for ${validDays} days — expires ${fmtDate(expiry)}</div>
        <div style="margin-top:6px">${esc(d.project_name)}</div>
        ${d.project_number ? `<div class="muted">#${esc(d.project_number)}</div>` : ''}</div>`
    : `<div class="right"><h1>${esc(title)}</h1>
        <div style="margin-top:4px">${esc(d.project_name)}</div>
        <div>Date: ${fmtDate(now)}</div>
        ${d.project_number ? `<div class="muted">#${esc(d.project_number)}</div>` : ''}
        ${mode === 'matrix' && d.quoted_by ? `<div>Prepared by: ${esc(d.quoted_by)}</div>` : ''}</div>`;

  // Client/site block is useful on the matrix (a site doc) but omitted from the
  // internal working/BoM export. It carries no pricing.
  const clientBlock = mode === 'working'
    ? ''
    : `<div class="bill-to">
        <span class="muted">Prepared for</span>
        <div><b>${esc(d.client_name) || 'Client'}</b></div>
        ${d.client_address ? `<div>${esc(d.client_address)}</div>` : ''}
        ${d.client_city ? `<div>${esc(d.client_city)}</div>` : ''}
        ${d.client_site ? `<div>Site: ${esc(d.client_site)}</div>` : ''}
      </div>`;

  return `<header>${letterhead}${right}</header>${clientBlock}`;
}

function shell(title: string, body: string, state: ProjectState, mode: HeaderMode = 'quote'): string {
  const footer = mode === 'quote'
    ? `${esc(state.details.purpose) || 'Quote'} — prices exclude GST unless stated`
    : mode === 'matrix'
      ? 'Room matrix — quantities per system type (working document, no pricing)'
      : 'Working document / bill of materials';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a2433; padding: 40px 46px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;
             border-bottom: 3px solid #1256a0; padding-bottom: 16px; }
    header .right { text-align: right; }
    .letterhead h2 { color: #1256a0; font-size: 16px; margin-bottom: 2px; }
    .letterhead .logo { max-height: 60px; max-width: 240px; margin-bottom: 8px; display: block; }
    .bill-to { margin: 0 0 20px; }
    .bill-to .muted { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
    h1 { font-size: 22px; color: #1256a0; }
    h2 { font-size: 15px; margin: 4px 0; }
    .muted { color: #67788e; }
    .lead { white-space: pre-wrap; margin-bottom: 14px; line-height: 1.5; }
    .notes-html { margin-bottom: 14px; line-height: 1.5; }
    .notes-html h1 { font-size: 18px; color: #1a2433; margin: 6px 0 3px; }
    .notes-html h2 { font-size: 16px; color: #1a2433; margin: 6px 0 3px; }
    .notes-html h3 { font-size: 14px; margin: 6px 0 3px; }
    .notes-html ul, .notes-html ol { margin: 4px 0 4px 22px; }
    /* A dragged-in width is inline on the img and carries through to here.
       Clamp so an oversized one can't run off the page, and keep proportions. */
    .notes-html img { max-width: 100%; height: auto; margin: 0.4em 1ch; }
    /* a floated (text-wrapped) image must not escape its block */
    .notes-html::after { content: ''; display: block; clear: both; }
    .floorplan { text-align: center; margin: 14px 0 18px; }
    .floorplan img { max-width: 100%; max-height: 430px; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { border: 1px solid #d5dce4; padding: 5px 8px; text-align: left; vertical-align: top; }
    th { background: #e8f0fa; font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    tr.totals td { font-weight: 700; background: #f4f7fb; }
    /* room matrix: type headers rotated vertical so each column is only as wide
       as the number it holds (uniform); the table is zoomed to fit the page. */
    table.matrix th, table.matrix td {
      padding: 2px 3px; text-align: center; vertical-align: middle;
      font-variant-numeric: tabular-nums; word-break: break-word;
    }
    table.matrix th.typecol {
      height: var(--hh, 140px); vertical-align: bottom; padding: 4px 0; word-break: normal;
    }
    table.matrix th.typecol > span {
      display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg);
      font-size: 9.5px; font-weight: 600; line-height: 1.05;
    }
    footer { margin-top: 30px; font-size: 10px; color: #67788e; }
    thead { display: table-header-group; }
    /* keep a row from splitting mid-row across pages. break-inside:avoid on
       table/tbody themselves (rather than just tr) would instead try to keep
       the WHOLE table on one page — for a table too long to ever fit one page,
       that just pushes the entire thing onto the next page, leaving the
       current one blank underneath whatever precedes it. Row-level only lets
       an over-long table flow across as many pages as it needs, breaking at
       row boundaries (header repeated) instead of mid-row. */
    tr { break-inside: avoid; page-break-inside: avoid; }
    /* keep a heading and its caption lines attached to the table that follows */
    h1, h2, h3, p.muted { break-after: avoid; page-break-after: avoid; }
    .notes-html, .floorplan { break-inside: avoid; page-break-inside: avoid; }
    section.page { page-break-before: always; }
    section > h2 { font-size: 16px; color: #1256a0; margin-bottom: 2px; }
  </style></head><body>
  ${header(title, state, mode)}
  ${body}
  <footer>${footer} — generated ${new Date().toLocaleString('en-AU')}.</footer>
  </body></html>`;
}

/** A room type's own rich-text (HTML) notes + centred floorplan image, if any.
 *  Notes are the user's contentEditable HTML (bold/lists/headings) — as-is. */
function roomNotesBlock(rt: ProjectState['room_types'][number] | undefined): string {
  const raw = rt?.notes ?? '';
  const hasNotes = raw.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '') !== '';
  const notes = hasNotes ? `<div class="notes-html">${raw}</div>` : '';
  const img = rt?.floorplan
    ? `<div class="floorplan"><img src="${rt.floorplan}" alt="Floorplan"></div>`
    : '';
  return notes + img;
}

/** Room Summary table. Without prices it becomes a room schedule (no money).
 *  `hideRooms` drops the room-numbers column. */
function roomSummaryTable(state: ProjectState, s: Settings, prices: boolean, hideRooms = false): string {
  const sum = roomSummary(state, s);
  const rows = sum.rows.filter((r) => r.quantity > 0 || r.perRoom !== 0);
  const roomsTh = hideRooms ? '' : '<th>Rooms</th>';
  const roomsTd = (typeIdx: number) => hideRooms ? '' : `<td>${roomsList(roomsOfType(state, typeIdx))}</td>`;
  const levelTd = (typeIdx: number) => `<td>${esc(levelsOfType(state, typeIdx).join(', ')) || '—'}</td>`;
  if (!prices) {
    return `
      <table>
        <thead><tr><th>Room Type</th><th>Level</th>${roomsTh}<th class="num">Quantity</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr><td>${esc(r.name)}</td>${levelTd(r.typeIdx)}${roomsTd(r.typeIdx)}
            <td class="num">${r.quantity}</td></tr>`).join('')}
        </tbody>
      </table>`;
  }
  const span = hideRooms ? 4 : 5; // label columns before the money column
  return `
    <table>
      <thead><tr><th>Room Type</th><th>Level</th>${roomsTh}<th class="num">Quantity</th>
        <th class="num">Cost per Room</th><th class="num">Total Cost</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><td>${esc(r.name)}</td>${levelTd(r.typeIdx)}${roomsTd(r.typeIdx)}
          <td class="num">${r.quantity}</td>
          <td class="num">${fmtMoney(r.perRoom)}</td><td class="num">${fmtMoney(r.total)}</td></tr>`).join('')}
        <tr class="totals"><td colspan="${span}">Total Invoice (Excluding GST)</td><td class="num">${fmtMoney(sum.exGst)}</td></tr>
        <tr><td colspan="${span}">GST</td><td class="num">${fmtMoney(sum.gst)}</td></tr>
        <tr class="totals"><td colspan="${span}">Total Invoice (Including GST)</td><td class="num">${fmtMoney(sum.incGst)}</td></tr>
      </tbody>
    </table>`;
}

/** Project-wide totals — equipment + each Labour & Materials category + GST. */
function projectTotalsTable(state: ProjectState, s: Settings): string {
  const t = projectTotals(state, s);
  const lmSubs = lmCategorySubtotals(state, s, null).filter((x) => x.amount !== 0);
  const gst = t.revenue * s.gst;
  return `
    <table>
      <thead><tr><th>Item</th><th class="num">Amount</th></tr></thead>
      <tbody>
        <tr class="totals"><td>Equipment</td><td class="num">${fmtMoney(t.equipmentRevenue)}</td></tr>
        ${lmSubs.map((x) => `<tr><td>Labour &amp; Materials — ${esc(x.name)}</td><td class="num">${fmtMoney(x.amount)}</td></tr>`).join('')}
        <tr class="totals"><td>Total (Excluding GST)</td><td class="num">${fmtMoney(t.revenue)}</td></tr>
        <tr><td>GST</td><td class="num">${fmtMoney(gst)}</td></tr>
        <tr class="totals"><td>Total (Including GST)</td><td class="num">${fmtMoney(t.revenue + gst)}</td></tr>
      </tbody>
    </table>`;
}

/**
 * One room type's section. With prices: an invoice (item table + L&M subtotals +
 * per-room total). Without prices: a bill of materials (Qty / Part / Description).
 */
function roomInvoiceSection(state: ProjectState, s: Settings, typeIdx: number, prices: boolean): string {
  const lines = roomInvoiceLines(state, s, typeIdx);
  const rt = state.room_types.find((t) => t.idx === typeIdx);
  const count = roomTypeCounts(state)[typeIdx] ?? 0;
  const rooms = roomsOfType(state, typeIdx);

  const heading = `
    <h2>${esc(rt?.name) || 'Room'} — ${count} room(s)</h2>
    <p class="muted">Rooms:</p>
    <div style="margin:2px 0 8px 8px">${roomsList(rooms)}</div>
    <p class="muted">Quantities per room</p>`;

  if (!prices) {
    return `${heading}${roomNotesBlock(rt)}
      <table>
        <thead><tr><th class="num">Qty</th><th>Part / Model</th><th>Description</th></tr></thead>
        <tbody>
          ${lines.map((l) => `<tr><td class="num">${l.qty}</td><td>${esc(l.partModel)}</td>
            <td>${esc(l.description)}</td></tr>`).join('')}
        </tbody>
      </table>`;
  }

  const lmSubs = lmCategorySubtotals(state, s, typeIdx).filter((x) => x.amount !== 0);
  const equipSubtotal = lines.reduce((a, l) => a + l.subtotal, 0);
  const exGst = equipSubtotal + lmSubs.reduce((a, l) => a + l.amount, 0);
  return `${heading}${roomNotesBlock(rt)}
    <table>
      <thead><tr><th class="num">Qty</th><th>Part / Model</th><th>Description</th>
        <th class="num">Unit Price</th><th class="num">Subtotal</th></tr></thead>
      <tbody>
        ${lines.map((l) => `<tr><td class="num">${l.qty}</td><td>${esc(l.partModel)}</td>
          <td>${esc(l.description)}</td><td class="num">${fmtMoney(l.unitSell)}</td>
          <td class="num">${fmtMoney(l.subtotal)}</td></tr>`).join('')}
        <tr class="totals"><td colspan="4">SUB-TOTAL — Equipment</td><td class="num">${fmtMoney(equipSubtotal)}</td></tr>
        ${lmSubs.map((x) => `<tr><td colspan="4">${esc(x.name)}</td><td class="num">${fmtMoney(x.amount)}</td></tr>`).join('')}
        <tr class="totals"><td colspan="4">Total Cost Per Room Excluding GST</td>
          <td class="num">${fmtMoney(exGst)}</td></tr>
      </tbody>
    </table>`;
}

/** Rooms × system types quantity matrix — a pricing-free working chart for site. */
function roomMatrixTable(state: ProjectState, availPx = 718): string {
  const counts = roomTypeCounts(state);
  const types = state.room_types;
  const qtyFor = (room: ProjectState['rooms'][number], idx: number) =>
    room.types.find((t) => t.type_idx === idx)?.qty ?? 0;
  const short = (name: string) => esc(name.replace(/SYSTEM TYPE/i, 'T'));
  // Fixed layout: wide-enough label columns + a uniform narrow column per type
  // (only as thick as a number). Known widths let us zoom the whole table to
  // fit the printable page width (availPx) so nothing falls off the edge.
  const LABEL_W = [58, 96, 66]; // Level, Area, Room No.
  const TYPE_W = 26;
  const tableW = LABEL_W.reduce((a, b) => a + b, 0) + types.length * TYPE_W + 4;
  const zoom = Math.min(1, +(availPx / tableW).toFixed(3));
  // Vertical header height = the longest type name, so all headers are uniform.
  const maxLen = Math.max(8, ...types.map((t) => short(t.name).length));
  const headH = Math.min(230, Math.max(60, Math.round(maxLen * 6.1) + 14));
  const cols = `<colgroup>${LABEL_W.map((w) => `<col style="width:${w}px">`).join('')}${types
    .map(() => `<col style="width:${TYPE_W}px">`)
    .join('')}</colgroup>`;
  const head = `<tr><th>Level</th><th>Area</th><th>Room No.</th>
    ${types.map((t) => `<th class="typecol" title="${esc(t.name)}"><span>${short(t.name)}</span></th>`).join('')}</tr>`;
  const rows = state.rooms
    .map((room) =>
      `<tr><td>${esc(room.level)}</td><td>${esc(room.area)}</td><td>${esc(room.room_no)}</td>
        ${types.map((t) => { const q = qtyFor(room, t.idx); return `<td>${q || ''}</td>`; }).join('')}</tr>`)
    .join('');
  const totals = `<tr class="totals"><td colspan="3">Total rooms per type</td>
    ${types.map((t) => `<td>${counts[t.idx] || ''}</td>`).join('')}</tr>`;
  return `<table class="matrix" style="width:${tableW}px; table-layout:fixed; zoom:${zoom}; --hh:${headH}px">${cols}<thead>${head}</thead><tbody>${rows}${totals}</tbody></table>`;
}

/** Procurement list — every used item A→Z by supplier, plus per-supplier totals. */
function procurementTable(state: ProjectState, s: Settings): string {
  const lines = procurement(state, s);
  const totalCost = lines.reduce((a, l) => a + l.unitCost * l.qty, 0);
  const totalSell = lines.reduce((a, l) => a + l.unitSell * l.qty, 0);
  const bySupplier = new Map<string, { cost: number; sell: number }>();
  for (const l of lines) {
    const k = l.supplier || '—';
    const e = bySupplier.get(k) ?? { cost: 0, sell: 0 };
    e.cost += l.unitCost * l.qty; e.sell += l.unitSell * l.qty;
    bySupplier.set(k, e);
  }
  return `
    <table>
      <thead><tr><th>Supplier</th><th>Manufacturer</th><th class="num">Quantity</th>
        <th>Part #</th><th>Description</th><th class="num">Cost</th><th class="num">Sell price</th></tr></thead>
      <tbody>
        ${lines.map((l) => `<tr><td>${esc(l.supplier)}</td><td>${esc(l.manufacturer)}</td>
          <td class="num">${l.qty}</td><td>${esc(l.partNumber)}</td><td>${esc(l.description)}</td>
          <td class="num">${fmtMoney(l.unitCost)}</td><td class="num">${fmtMoney(l.unitSell)}</td></tr>`).join('')}
        <tr class="totals"><td colspan="5">Total (Quantity × unit)</td>
          <td class="num">${fmtMoney(totalCost)}</td><td class="num">${fmtMoney(totalSell)}</td></tr>
      </tbody>
    </table>
    <h3>Per-supplier totals</h3>
    <table>
      <thead><tr><th>Supplier</th><th class="num">Total Cost</th><th class="num">Total Sell</th></tr></thead>
      <tbody>
        ${[...bySupplier].map(([supplier, x]) => `<tr><td>${esc(supplier)}</td>
          <td class="num">${fmtMoney(x.cost)}</td><td class="num">${fmtMoney(x.sell)}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

export function renderDocument(
  state: ProjectState,
  doc: DocKind,
  opts: { prices?: boolean; hideRooms?: boolean; matrix?: boolean } = {},
): { title: string; html: string } {
  const s = settingsOf(state);
  const prices = opts.prices !== false;
  const hideRooms = !!opts.hideRooms;
  const matrix = !!opts.matrix;

  if (doc.kind === 'matrix') {
    const body = roomMatrixTable(state, 1047); // prints landscape
    return { title: 'Room Matrix', html: shell('Room Matrix', body, state, 'matrix') };
  }

  if (doc.kind === 'procurement') {
    const title = 'Procurement';
    const body = procurementTable(state, s);
    return { title, html: shell(title, body, state, 'working') };
  }

  // Workbook: room summary first, then a page per room type (invoice with
  // prices, or bill of materials without) with its own notes, then optionally
  // the room-matrix chart at the very bottom.
  if (doc.kind === 'workbook') {
    const wbCounts = roomTypeCounts(state);
    const wbTypes = state.room_types.filter((rt) => (wbCounts[rt.idx] ?? 0) > 0);
    const summaryPage = `<section class="${matrix ? 'page' : ''}"><h2>Room Summary</h2>${roomSummaryTable(state, s, prices, hideRooms)}</section>`;
    const roomPages = wbTypes
      .map((rt) => `<section class="page">${roomInvoiceSection(state, s, rt.idx, prices)}</section>`)
      .join('');
    // Matrix goes at the top of the first page, under the title (no page break).
    const matrixPage = matrix
      ? `<section><h2>Room Matrix</h2>${roomMatrixTable(state, 718)}</section>` // workbook prints portrait
      : '';
    const body = matrixPage + summaryPage + roomPages;
    const title = 'Project Workbook'; // same title with or without prices
    return { title, html: shell(title, body, state, prices ? 'quote' : 'working') };
  }

  if (doc.kind === 'summary') {
    const title = 'Room Summary'; // same title with or without prices
    const body = roomSummaryTable(state, s, prices, hideRooms);
    return { title, html: shell(title, body, state, prices ? 'quote' : 'working') };
  }

  if (doc.kind === 'room') {
    const rt = state.room_types.find((t) => t.idx === doc.typeIdx);
    const title = `Room Invoice — ${rt?.name ?? ''}`; // same title with or without prices
    // roomInvoiceSection now carries this room type's own notes + floorplan.
    const body = roomInvoiceSection(state, s, doc.typeIdx, prices);
    return { title, html: shell(title, body, state, prices ? 'quote' : 'working') };
  }

  // Total: a page per room type (each with its own notes), then project totals.
  const counts = roomTypeCounts(state);
  const usedTypes = state.room_types.filter((rt) => (counts[rt.idx] ?? 0) > 0);
  const roomPages = usedTypes
    .map((rt, i) =>
      `<section class="${i === 0 ? '' : 'page'}">${roomInvoiceSection(state, s, rt.idx, prices)}</section>`)
    .join('');

  if (!prices) {
    // Collated bills of materials + room summary — same title as the priced doc.
    const end = `<section class="${roomPages ? 'page' : ''}">
      <h2>Room Summary</h2>${roomSummaryTable(state, s, false, hideRooms)}</section>`;
    const body = roomPages + end;
    return { title: 'Total Project Invoice', html: shell('Total Project Invoice', body, state, 'working') };
  }

  const endTable = `<section class="${roomPages ? 'page' : ''}">
    <h2>Project Totals</h2>${projectTotalsTable(state, s)}
    <h2 style="margin-top:20px">Room Summary</h2>${roomSummaryTable(state, s, true, hideRooms)}</section>`;
  const body = roomPages + endTable;
  return { title: 'Total Project Invoice', html: shell('Total Project Invoice', body, state) };
}
