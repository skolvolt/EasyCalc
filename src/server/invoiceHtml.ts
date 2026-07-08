import type { ProjectState } from '../shared/types';
import {
  settingsOf, roomInvoiceLines, lmCategorySubtotals,
  roomSummary, roomTypeCounts, roomsOfType, projectTotals, type Settings,
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
  | { kind: 'room'; typeIdx: number };

/** Quotes are valid for 30 days from the export date. */
const QUOTE_VALIDITY_DAYS = 30;

function header(title: string, state: ProjectState, minimal: boolean): string {
  const d = state.details;
  const now = new Date();
  const expiry = new Date(now.getTime() + QUOTE_VALIDITY_DAYS * 24 * 3600 * 1000);
  const fmtDate = (dt: Date) => dt.toLocaleDateString('en-AU');

  const letterhead = `<div class="letterhead">
    ${d.company_logo ? `<img src="${d.company_logo}" class="logo">` : ''}
    ${d.company_name ? `<h2>${esc(d.company_name)}</h2>` : ''}
    ${d.company_address ? `<div>${esc(d.company_address)}</div>` : ''}
    ${d.company_phone ? `<div>Ph: ${esc(d.company_phone)}</div>` : ''}
    ${d.company_website ? `<div>${esc(d.company_website)}</div>` : ''}
  </div>`;

  const right = minimal
    ? `<div class="right"><h1>${esc(title)}</h1>
        <div style="margin-top:4px">${esc(d.project_name)}</div>
        <div>Date: ${fmtDate(now)}</div>
        ${d.project_number ? `<div class="muted">#${esc(d.project_number)}</div>` : ''}</div>`
    : `<div class="right"><h1>${esc(title)}</h1>
        <div>Date: ${fmtDate(now)}</div>
        ${d.quoted_by ? `<div>Quoted by: ${esc(d.quoted_by)}</div>` : ''}
        <div>Valid for ${QUOTE_VALIDITY_DAYS} days — expires ${fmtDate(expiry)}</div>
        <div style="margin-top:6px">${esc(d.project_name)}</div>
        ${d.project_number ? `<div class="muted">#${esc(d.project_number)}</div>` : ''}</div>`;

  const clientBlock = minimal
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

function shell(title: string, body: string, state: ProjectState, minimal = false): string {
  const footer = minimal
    ? 'Working document / bill of materials'
    : `${esc(state.details.purpose) || 'Quote'} — prices exclude GST unless stated`;
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
    .floorplan { text-align: center; margin: 14px 0 18px; }
    .floorplan img { max-width: 100%; max-height: 430px; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { border: 1px solid #d5dce4; padding: 5px 8px; text-align: left; vertical-align: top; }
    th { background: #e8f0fa; font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    tr.totals td { font-weight: 700; background: #f4f7fb; }
    footer { margin-top: 30px; font-size: 10px; color: #67788e; }
    thead { display: table-header-group; }
    /* keep whole tables (and their bodies / rows) from splitting across pages.
       An over-long table still breaks — but at row boundaries, with the header
       repeated — rather than mid-row. */
    table, tbody, tr { break-inside: avoid; page-break-inside: avoid; }
    /* keep a heading and its caption lines attached to the table that follows */
    h1, h2, h3, p.muted { break-after: avoid; page-break-after: avoid; }
    .notes-html, .floorplan { break-inside: avoid; page-break-inside: avoid; }
    section.page { page-break-before: always; }
    section > h2 { font-size: 16px; color: #1256a0; margin-bottom: 2px; }
  </style></head><body>
  ${header(title, state, minimal)}
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

/** Room Summary table. Without prices it becomes a room schedule (no money). */
function roomSummaryTable(state: ProjectState, s: Settings, prices: boolean): string {
  const sum = roomSummary(state, s);
  const rows = sum.rows.filter((r) => r.quantity > 0 || r.perRoom > 0);
  if (!prices) {
    return `
      <table>
        <thead><tr><th>Room Type</th><th>Rooms</th><th class="num">Quantity</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${roomsList(roomsOfType(state, r.typeIdx))}</td>
            <td class="num">${r.quantity}</td></tr>`).join('')}
        </tbody>
      </table>`;
  }
  return `
    <table>
      <thead><tr><th>Room Type</th><th>Rooms</th><th class="num">Quantity</th>
        <th class="num">Cost per Room</th><th class="num">Total Cost</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${roomsList(roomsOfType(state, r.typeIdx))}</td>
          <td class="num">${r.quantity}</td>
          <td class="num">${fmtMoney(r.perRoom)}</td><td class="num">${fmtMoney(r.total)}</td></tr>`).join('')}
        <tr class="totals"><td colspan="4">Total Invoice (Excluding GST)</td><td class="num">${fmtMoney(sum.exGst)}</td></tr>
        <tr><td colspan="4">GST</td><td class="num">${fmtMoney(sum.gst)}</td></tr>
        <tr class="totals"><td colspan="4">Total Invoice (Including GST)</td><td class="num">${fmtMoney(sum.incGst)}</td></tr>
      </tbody>
    </table>`;
}

/** Project-wide totals — equipment + each Labour & Materials category + GST. */
function projectTotalsTable(state: ProjectState, s: Settings): string {
  const t = projectTotals(state, s);
  const lmSubs = lmCategorySubtotals(state, s, null).filter((x) => x.amount > 0);
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
    return `${roomNotesBlock(rt)}${heading}
      <table>
        <thead><tr><th class="num">Qty</th><th>Part / Model</th><th>Description</th></tr></thead>
        <tbody>
          ${lines.map((l) => `<tr><td class="num">${l.qty}</td><td>${esc(l.partModel)}</td>
            <td>${esc(l.description)}</td></tr>`).join('')}
        </tbody>
      </table>`;
  }

  const lmSubs = lmCategorySubtotals(state, s, typeIdx).filter((x) => x.amount > 0);
  const equipSubtotal = lines.reduce((a, l) => a + l.subtotal, 0);
  const exGst = equipSubtotal + lmSubs.reduce((a, l) => a + l.amount, 0);
  return `${roomNotesBlock(rt)}${heading}
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

export function renderDocument(
  state: ProjectState,
  doc: DocKind,
  opts: { prices?: boolean } = {},
): { title: string; html: string } {
  const s = settingsOf(state);
  const prices = opts.prices !== false;

  if (doc.kind === 'summary') {
    const title = prices ? 'Room Summary' : 'Room Schedule';
    const body = roomSummaryTable(state, s, prices);
    return { title, html: shell(title, body, state, !prices) };
  }

  if (doc.kind === 'room') {
    const rt = state.room_types.find((t) => t.idx === doc.typeIdx);
    // Without prices this is a Bill of Materials for installation/logistics.
    const title = prices ? `Room Invoice — ${rt?.name ?? ''}` : `Bill of Materials — ${rt?.name ?? ''}`;
    // roomInvoiceSection now carries this room type's own notes + floorplan.
    const body = roomInvoiceSection(state, s, doc.typeIdx, prices);
    return { title, html: shell(title, body, state, !prices) };
  }

  // Total: a page per room type (each with its own notes), then project totals.
  const counts = roomTypeCounts(state);
  const usedTypes = state.room_types.filter((rt) => (counts[rt.idx] ?? 0) > 0);
  const roomPages = usedTypes
    .map((rt, i) =>
      `<section class="${i === 0 ? '' : 'page'}">${roomInvoiceSection(state, s, rt.idx, prices)}</section>`)
    .join('');

  if (!prices) {
    // "Export Workbook" — collated bills of materials + a room schedule.
    const end = `<section class="${roomPages ? 'page' : ''}">
      <h2>Room Schedule</h2>${roomSummaryTable(state, s, false)}</section>`;
    const body = roomPages + end;
    return { title: 'Project Workbook', html: shell('Project Workbook', body, state, true) };
  }

  const endTable = `<section class="${roomPages ? 'page' : ''}">
    <h2>Project Totals</h2>${projectTotalsTable(state, s)}
    <h2 style="margin-top:20px">Room Summary</h2>${roomSummaryTable(state, s, true)}</section>`;
  const body = roomPages + endTable;
  return { title: 'Total Project Invoice', html: shell('Total Project Invoice', body, state) };
}
