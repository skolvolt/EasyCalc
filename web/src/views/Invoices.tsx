import { useState } from 'react';
import { useProject, fmtMoney } from '../state';
import {
  settingsOf, roomInvoiceLines, totalInvoiceLines, lmCategorySubtotals,
  roomSummary, roomTypeCounts, roomsOfType,
} from '@shared/engine';
import RichText from '../components/RichText';

/** True when rich-text HTML has any visible text/content. */
const hasContent = (html: string | null | undefined) =>
  !!html && html.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '') !== '';

const readFileAsDataUrl = (f: File, cb: (dataUrl: string) => void) => {
  const reader = new FileReader();
  reader.onload = () => cb(String(reader.result));
  reader.readAsDataURL(f);
};

type Tab = 'summary' | 'room' | 'total';

export default function Invoices() {
  const { state, path, dirty, saveNow, update } = useProject();
  const [tab, setTab] = useState<Tab>('summary');
  const [roomType, setRoomType] = useState<number>(0);
  if (!state) return null;
  const s = settingsOf(state);
  const counts = roomTypeCounts(state);
  const summary = roomSummary(state, s);
  const d = state.details;

  // keep the room-invoice selection pointed at a type that still exists
  const roomTypeIdx = state.room_types.some((rt) => rt.idx === roomType)
    ? roomType
    : (state.room_types[0]?.idx ?? 0);

  const isRoom = tab === 'room';
  const lines = isRoom
    ? roomInvoiceLines(state, s, roomTypeIdx)
    : tab === 'total'
      ? totalInvoiceLines(state, s)
      : [];
  const lmSubs = tab !== 'summary'
    ? lmCategorySubtotals(state, s, isRoom ? roomTypeIdx : null).filter((x) => x.amount > 0)
    : [];
  const equipSubtotal = lines.reduce((a, l) => a + l.subtotal, 0);
  const exGst = equipSubtotal + lmSubs.reduce((a, l) => a + l.amount, 0);

  const pdfQuery = tab === 'room' ? `doc=room&typeIdx=${roomTypeIdx}` : `doc=${tab}`;

  // Notes + floorplan are per room type — shown on the Room Invoice tab only,
  // specific to the room currently selected in the dropdown.
  const rtArrIdx = state.room_types.findIndex((rt) => rt.idx === roomTypeIdx);
  const selectedType = rtArrIdx >= 0 ? state.room_types[rtArrIdx] : undefined;
  const showExtras = tab === 'room';
  const notes = selectedType?.notes;
  const floorplan = selectedType?.floorplan;

  const openExport = async (base: 'pdf' | 'xlsx', extra = '') => {
    if (!path) return;
    if (dirty) await saveNow(); // export renders from the saved file
    window.open(`/api/${base}?path=${encodeURIComponent(path)}&${pdfQuery}${extra}`, '_blank');
  };
  const roomsVertical = (typeIdx: number) => {
    const rooms = roomsOfType(state, typeIdx);
    return rooms.length ? rooms.map((r, i) => <div key={i}>{r}</div>) : '—';
  };
  const noPricesLabel = tab === 'total' ? 'Export Workbook' : tab === 'room' ? 'Bill of Materials' : 'PDF — no prices';

  const TABS: [Tab, string][] = [
    ['summary', 'Room Summary'],
    ['room', 'Room Invoice'],
    ['total', 'Total Project Invoice'],
  ];

  return (
    <>
      <h1>Quotes & Invoices</h1>
      <div className="subtitle">Live document previews — each exports to PDF from the same template.</div>

      <div className="doc-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        {tab === 'room' && (
          <select value={roomTypeIdx} onChange={(e) => setRoomType(Number(e.target.value))}>
            {state.room_types.map((rt) => (
              <option key={rt.idx} value={rt.idx}>{rt.name}</option>
            ))}
          </select>
        )}
        <button className="btn" onClick={() => openExport('pdf')}>Download PDF</button>
        <button className="btn secondary" onClick={() => openExport('xlsx')}>Export Excel</button>
        <button
          className="btn secondary"
          title="Export a PDF with no prices — for installation / logistics"
          onClick={() => openExport('pdf', '&prices=off')}
        >
          {noPricesLabel}
        </button>
      </div>

      {tab === 'room' && selectedType && (
        <div className="panel">
          <h2>Notes &amp; floorplan — {selectedType.name}</h2>
          <div className="subtitle" style={{ marginBottom: 12 }}>
            Specific to this room type. Choose a different room above to edit its own notes.
          </div>
          <div className="summary-extras">
            <div>
              <h3>Notes</h3>
              <RichText
                key={roomTypeIdx}
                value={notes ?? ''}
                onChange={(html) => update((dr) => (dr.room_types[rtArrIdx].notes = html))}
                minHeight={160}
                placeholder={`Notes for ${selectedType.name} — shown at the top of its Room Invoice / Bill of Materials PDF…`}
              />
            </div>
            <div>
              <h3>Floorplan image (printed centred)</h3>
              <div className="floorplan-drop">
                {floorplan
                  ? <img src={floorplan} alt="floorplan" />
                  : <span style={{ color: 'var(--muted)', fontSize: 12 }}>No floorplan uploaded</span>}
                <div className="toolbar" style={{ marginBottom: 0, justifyContent: 'center' }}>
                  <label className="btn-outline" style={{ cursor: 'pointer' }}>
                    {floorplan ? 'Replace image' : 'Upload image'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) readFileAsDataUrl(f, (url) => update((dr) => (dr.room_types[rtArrIdx].floorplan = url)));
                      }}
                    />
                  </label>
                  {floorplan && (
                    <button className="btn-outline" onClick={() => update((dr) => (dr.room_types[rtArrIdx].floorplan = null))}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="invoice">
        <header>
          <div className="letterhead">
            {d.company_logo && <img src={d.company_logo} alt="company" className="logo" />}
            {d.company_name && <h2 style={{ color: 'var(--accent)' }}>{d.company_name}</h2>}
            {d.company_address && <div>{d.company_address}</div>}
            {d.company_phone && <div>Ph: {d.company_phone}</div>}
            {d.company_website && <div>{d.company_website}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2>{d.purpose || 'Quote'}</h2>
            <div>Date: {new Date().toLocaleDateString('en-AU')}</div>
            {d.quoted_by && <div>Quoted by: {d.quoted_by}</div>}
            <div>
              Valid for 30 days — expires{' '}
              {new Date(Date.now() + 30 * 24 * 3600 * 1000).toLocaleDateString('en-AU')}
            </div>
            <div style={{ marginTop: 6 }}>{d.project_name}</div>
            {d.project_number && <div>#{String(d.project_number)}</div>}
          </div>
        </header>
        <div className="bill-to">
          <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Prepared for</span>
          <div><b>{d.client_name || 'Client'}</b></div>
          {d.client_address && <div>{d.client_address}</div>}
          {d.client_city && <div>{d.client_city}</div>}
          {d.client_site && <div>Site: {d.client_site}</div>}
        </div>

        {/* notes + floorplan mirror the PDF for summary & room documents */}
        {showExtras && hasContent(notes) && (
          <div className="rt-content" style={{ marginBottom: 12 }} dangerouslySetInnerHTML={{ __html: notes! }} />
        )}
        {showExtras && floorplan && (
          <div style={{ textAlign: 'center', margin: '12px 0' }}>
            <img src={floorplan} alt="floorplan" style={{ maxWidth: '100%', maxHeight: 360 }} />
          </div>
        )}

        {tab === 'summary' && (
          <table className="grid">
            <thead>
              <tr>
                <th>Room Type</th>
                <th>Rooms</th>
                <th className="num">Quantity</th>
                <th className="num">Cost per Room</th>
                <th className="num">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows
                .filter((r) => r.quantity > 0 || r.perRoom > 0)
                .map((r) => (
                  <tr key={r.typeIdx}>
                    <td>{r.name}</td>
                    <td>{roomsVertical(r.typeIdx)}</td>
                    <td className="num">{r.quantity}</td>
                    <td className="num">{fmtMoney(r.perRoom)}</td>
                    <td className="num">{fmtMoney(r.total)}</td>
                  </tr>
                ))}
              <tr className="totals">
                <td colSpan={4}>Total Invoice (Excluding GST)</td>
                <td className="num">{fmtMoney(summary.exGst)}</td>
              </tr>
              <tr>
                <td colSpan={4}>GST</td>
                <td className="num">{fmtMoney(summary.gst)}</td>
              </tr>
              <tr className="totals">
                <td colSpan={4}>Total Invoice (Including GST)</td>
                <td className="num">{fmtMoney(summary.incGst)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {tab !== 'summary' && (
          <>
            {isRoom && (
              <div style={{ marginBottom: 14 }}>
                <b>{state.room_types.find((rt) => rt.idx === roomTypeIdx)?.name}</b> ×{' '}
                {counts[roomTypeIdx] ?? 0} room(s) — prices per room
                <div className="subtitle" style={{ marginTop: 4 }}>
                  Rooms:
                  <div style={{ marginLeft: 10 }}>{roomsVertical(roomTypeIdx)}</div>
                </div>
              </div>
            )}
            {tab === 'total' && (
              <p className="subtitle" style={{ marginBottom: 14 }}>
                The exported PDF expands every room type across its own page(s), then ends with the
                project summary table.
              </p>
            )}
            <table className="grid">
              <thead>
                <tr>
                  <th className="num">Qty</th>
                  <th>Part / Model</th>
                  <th>Description</th>
                  <th className="num">Unit Price</th>
                  <th className="num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="num">{l.qty}</td>
                    <td>{l.partModel}</td>
                    <td>{l.description}</td>
                    <td className="num">{fmtMoney(l.unitSell)}</td>
                    <td className="num">{fmtMoney(l.subtotal)}</td>
                  </tr>
                ))}
                <tr className="totals">
                  <td colSpan={4}>SUB-TOTAL — Equipment</td>
                  <td className="num">{fmtMoney(equipSubtotal)}</td>
                </tr>
                {lmSubs.map((x) => (
                  <tr key={x.name}>
                    <td colSpan={4}>{x.name}</td>
                    <td className="num">{fmtMoney(x.amount)}</td>
                  </tr>
                ))}
                <tr className="totals">
                  <td colSpan={4}>
                    {isRoom ? 'Total Cost Per Room Excluding GST' : 'Total Cost Excluding GST'}
                  </td>
                  <td className="num">{fmtMoney(exGst)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}
