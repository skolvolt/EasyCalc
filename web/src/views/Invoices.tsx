import { useProject, fmtMoney } from '../state';
import { useSticky } from '../viewMemory';
import {
  settingsOf, roomInvoiceLines, totalInvoiceLines, lmCategorySubtotals,
  roomSummary, roomTypeCounts, roomsOfType, levelsOfType,
} from '@shared/engine';
import RichText from '../components/RichText';

/** True when rich-text HTML has any visible text/content. */
const hasContent = (html: string | null | undefined) =>
  !!html && html.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '') !== '';


type Tab = 'summary' | 'room' | 'total';

export default function Invoices() {
  const { state, path, dirty, saveNow, update } = useProject();
  // remembered across navigation — see viewMemory
  const [tab, setTab] = useSticky<Tab>('invoices.tab', 'summary');
  const [roomType, setRoomType] = useSticky<number>('invoices.roomType', 0);
  const [hideRoomNums, setHideRoomNums] = useSticky('invoices.hideRoomNums', false);
  const [includeMatrix, setIncludeMatrix] = useSticky('invoices.includeMatrix', false);
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
    ? lmCategorySubtotals(state, s, isRoom ? roomTypeIdx : null).filter((x) => x.amount !== 0)
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
    const roomnums = tab === 'summary' && hideRoomNums ? '&roomnums=off' : '';
    window.open(`/api/${base}?path=${encodeURIComponent(path)}&${pdfQuery}${extra}${roomnums}`, '_blank');
  };
  const roomsVertical = (typeIdx: number) => {
    const rooms = roomsOfType(state, typeIdx);
    return rooms.length ? rooms.map((r, i) => <div key={i}>{r}</div>) : '—';
  };

  // Full workbook PDF: room summary, every room invoice/BoM + notes, and
  // optionally the room matrix — configured from the Room Summary tab.
  const openWorkbook = async (prices: boolean) => {
    if (!path) return;
    if (dirty) await saveNow();
    const q = [
      `path=${encodeURIComponent(path)}`,
      'doc=workbook',
      prices ? '' : 'prices=off',
      hideRoomNums ? 'roomnums=off' : '',
      includeMatrix ? 'matrix=on' : '',
    ].filter(Boolean).join('&');
    window.open(`/api/pdf?${q}`, '_blank');
  };

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

        {/* Room Summary: workbook exports (left) + options */}
        {tab === 'summary' && (
          <>
            <button
              className="btn"
              title="Full workbook PDF: room summary first, then every room invoice + notes"
              onClick={() => openWorkbook(true)}
            >
              Export Workbook
            </button>
            <button
              className="btn secondary"
              title="Same workbook with no prices — bills of materials"
              onClick={() => openWorkbook(false)}
            >
              Export Workbook — no $
            </button>
            <label style={{ fontSize: 13 }}>
              <input type="checkbox" checked={hideRoomNums} onChange={(e) => setHideRoomNums(e.target.checked)} />{' '}
              Remove room numbers
            </label>
            <label style={{ fontSize: 13 }}>
              <input type="checkbox" checked={includeMatrix} onChange={(e) => setIncludeMatrix(e.target.checked)} />{' '}
              Include room matrix
            </label>
          </>
        )}

        <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => openExport('pdf')}>Download PDF</button>
        <button className="btn secondary" onClick={() => openExport('xlsx')}>Export Excel</button>

        {/* Room Invoice: bill-of-materials variants */}
        {tab === 'room' && (
          <>
            <button
              className="btn secondary"
              title="Bill of materials, no prices (per room)"
              onClick={() => openExport('pdf', '&prices=off')}
            >
              BOM - no $ (per room)
            </button>
            <button
              className="btn secondary"
              title="Bill of materials with prices (per room)"
              onClick={() => openExport('pdf')}
            >
              BOM w/$
            </button>
          </>
        )}

        {/* Room Summary: this-summary-only no-prices PDF */}
        {tab === 'summary' && (
          <button
            className="btn secondary"
            title="This room summary as a room schedule PDF (no prices)"
            onClick={() => openExport('pdf', '&prices=off')}
          >
            PDF — no prices
          </button>
        )}
      </div>

      {tab === 'room' && selectedType && (
        <div className="panel">
          <h2>Notes — {selectedType.name}</h2>
          <div className="subtitle" style={{ marginBottom: 12 }}>
            Specific to this room type. Choose a different room above to edit its own notes.
            Paste images straight into the notes and drag their corners to size them.
          </div>
          <RichText
            key={roomTypeIdx}
            value={notes ?? ''}
            onChange={(html) => update((dr) => (dr.room_types[rtArrIdx].notes = html))}
            minHeight={160}
            placeholder={`Notes for ${selectedType.name} — shown at the top of its Room Invoice / Bill of Materials PDF…`}
          />
          {/* The separate floorplan upload is gone — images belong in the notes
              now. Rooms that already have one keep printing it, with a way to
              clear it, so an existing project isn't stranded with an image it
              can no longer manage. */}
          {floorplan && (
            <div className="legacy-floorplan">
              <img src={floorplan} alt="floorplan" />
              <div>
                <b>This room has a separate floorplan image</b>
                <div className="subtitle" style={{ margin: '2px 0 8px' }}>
                  Added before images could go in the notes. It still prints, centred, below them.
                  To reposition or resize it, paste it into the notes instead and remove it here.
                </div>
                <button
                  className="btn-outline"
                  onClick={() => update((dr) => (dr.room_types[rtArrIdx].floorplan = null))}
                >
                  Remove floorplan
                </button>
              </div>
            </div>
          )}
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
              Valid for {d.quote_expiry_days ?? 30} days — expires{' '}
              {new Date(Date.now() + (d.quote_expiry_days ?? 30) * 24 * 3600 * 1000).toLocaleDateString('en-AU')}
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
                <th>Level</th>
                {!hideRoomNums && <th>Rooms</th>}
                <th className="num">Quantity</th>
                <th className="num">Cost per Room</th>
                <th className="num">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows
                .filter((r) => r.quantity > 0 || r.perRoom !== 0)
                .map((r) => (
                  <tr key={r.typeIdx}>
                    <td>{r.name}</td>
                    <td>{levelsOfType(state, r.typeIdx).join(', ') || '—'}</td>
                    {!hideRoomNums && <td>{roomsVertical(r.typeIdx)}</td>}
                    <td className="num">{r.quantity}</td>
                    <td className="num">{fmtMoney(r.perRoom)}</td>
                    <td className="num">{fmtMoney(r.total)}</td>
                  </tr>
                ))}
              <tr className="totals">
                <td colSpan={hideRoomNums ? 4 : 5}>Total Invoice (Excluding GST)</td>
                <td className="num">{fmtMoney(summary.exGst)}</td>
              </tr>
              <tr>
                <td colSpan={hideRoomNums ? 4 : 5}>GST</td>
                <td className="num">{fmtMoney(summary.gst)}</td>
              </tr>
              <tr className="totals">
                <td colSpan={hideRoomNums ? 4 : 5}>Total Invoice (Including GST)</td>
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
