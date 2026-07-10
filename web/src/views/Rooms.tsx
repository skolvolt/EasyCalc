import { useState } from 'react';
import { useProject, fmtMoney, numFmt, numParse, isEmbedded } from '../state';
import { settingsOf, perRoomType, roomTypeCounts } from '@shared/engine';
import NumInput from '../components/NumInput';
import type { Room } from '@shared/types';

export default function Rooms() {
  const { state, update, path, dirty, saveNow } = useProject();
  const [matrix, setMatrix] = useState(false);
  if (!state) return null;
  const s = settingsOf(state);
  const per = perRoomType(state, s);
  const counts = roomTypeCounts(state);

  const addType = () =>
    update((dr) => {
      dr.room_types.push({
        idx: dr.room_types.length,
        name: `SYSTEM TYPE ${dr.room_types.length}`,
        class: 'Standard',
      });
    });

  const removeType = (idx: number) =>
    update((dr) => {
      dr.room_types = dr.room_types.filter((t) => t.idx !== idx);
      dr.room_types.forEach((t, i) => {
        t.idx = i;
        const remap = (alloc: Record<string, number>) => {
          const out: Record<string, number> = {};
          for (const [k, v] of Object.entries(alloc)) {
            const n = +k;
            if (n === idx) continue;
            out[String(n > idx ? n - 1 : n)] = v;
          }
          return out;
        };
        dr.catalogue.forEach((it) => (it.allocations = remap(it.allocations)));
        dr.labour_materials.forEach((it) => (it.allocations = remap(it.allocations)));
        dr.rooms.forEach(
          (r) =>
            (r.types = r.types
              .filter((rt) => rt.type_idx !== idx)
              .map((rt) => ({ ...rt, type_idx: rt.type_idx > idx ? rt.type_idx - 1 : rt.type_idx }))),
        );
      });
    });

  const addRooms = (n: number) =>
    update((dr) => {
      for (let i = 0; i < n; i++) dr.rooms.push({ level: '', area: '', room_no: '', types: [] });
    });

  // --- multi-type-per-room helpers (list view) ---
  const setRoomTypeIdx = (ri: number, ti: number, v: number) =>
    update((dr) => (dr.rooms[ri].types[ti].type_idx = v));
  const setRoomTypeQty = (ri: number, ti: number, qty: number) =>
    update((dr) => (dr.rooms[ri].types[ti].qty = qty));
  const addRoomType = (ri: number) =>
    update((dr) => {
      const used = new Set(dr.rooms[ri].types.map((t) => t.type_idx));
      const free = dr.room_types.find((rt) => !used.has(rt.idx))?.idx ?? dr.room_types[0]?.idx ?? 0;
      dr.rooms[ri].types.push({ type_idx: free, qty: 1 });
    });
  const removeRoomType = (ri: number, ti: number) =>
    update((dr) => dr.rooms[ri].types.splice(ti, 1));

  // Export the matrix as a site document (letterhead + project/client details,
  // no pricing). Renders from the saved file, so save first.
  const exportMatrix = async (base: 'pdf' | 'xlsx') => {
    if (!path) return;
    if (dirty) await saveNow();
    window.open(`/api/${base}?path=${encodeURIComponent(path)}&doc=matrix`, '_blank');
  };

  // --- matrix cell helpers ---
  const matrixQty = (room: Room, typeIdx: number) =>
    room.types.find((t) => t.type_idx === typeIdx)?.qty ?? null;
  const setMatrixQty = (ri: number, typeIdx: number, n: number | null) =>
    update((dr) => {
      const types = dr.rooms[ri].types;
      const ex = types.find((t) => t.type_idx === typeIdx);
      if (n == null || n === 0) dr.rooms[ri].types = types.filter((t) => t.type_idx !== typeIdx);
      else if (ex) ex.qty = n;
      else types.push({ type_idx: typeIdx, qty: n });
    });

  const roomFields = (room: Room, i: number) => (
    <>
      <td><input value={room.level ?? ''} onChange={(e) => update((dr) => (dr.rooms[i].level = e.target.value))} /></td>
      <td><input value={room.area ?? ''} onChange={(e) => update((dr) => (dr.rooms[i].area = e.target.value))} /></td>
      <td><input value={room.room_no ?? ''} onChange={(e) => update((dr) => (dr.rooms[i].room_no = e.target.value))} /></td>
    </>
  );

  return (
    <>
      <h1>Rooms & System Types</h1>
      <div className="subtitle">
        Define system types, then assign each physical room to one or more types with quantities.
        Quantities flow from here into every calculation.
      </div>

      <div className="panel">
        <h2>System Types</h2>
        <div className="toolbar">
          <button className="btn" onClick={addType}>+ Add system type</button>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th><th>Class</th><th className="num">Rooms</th>
              <th className="num">Cost / room</th><th className="num">Sell / room</th>
              <th className="num">Power (W)</th><th></th>
            </tr>
          </thead>
          <tbody>
            {state.room_types.map((rt) => (
              <tr key={rt.idx}>
                <td><input value={rt.name} onChange={(e) => update((dr) => (dr.room_types[rt.idx].name = e.target.value))} /></td>
                <td>
                  <select value={rt.class} onChange={(e) => update((dr) => (dr.room_types[rt.idx].class = e.target.value as any))}>
                    <option>Standard</option><option>Unique</option>
                  </select>
                </td>
                <td className="num">{counts[rt.idx]}</td>
                <td className="num">{fmtMoney(per.totalCost[rt.idx])}</td>
                <td className="num">{fmtMoney(per.totalSell[rt.idx])}</td>
                <td className="num">{per.power[rt.idx].toFixed(0)}</td>
                <td><button className="btn minus" onClick={() => removeType(rt.idx)}>−</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ marginBottom: 0 }}>Physical Rooms</h2>
          <button className="btn secondary" onClick={() => setMatrix((m) => !m)}>
            {matrix ? '☰ List view' : '▦ Matrix view'}
          </button>
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => addRooms(1)}>+ Add room</button>
          <button className="btn secondary" onClick={() => addRooms(5)}>+ 5</button>
          <button className="btn secondary" onClick={() => addRooms(10)}>+ 10</button>
          {matrix && <button className="btn secondary" onClick={addType}>+ Add type (column)</button>}
          {matrix && !isEmbedded && path && (
            <>
              <button className="btn secondary" onClick={() => exportMatrix('pdf')} title="Room matrix as PDF (letterhead + project details, no pricing)">
                ⬇ Export PDF
              </button>
              <button className="btn secondary" onClick={() => exportMatrix('xlsx')} title="Room matrix as Excel (no pricing)">
                ⬇ Export Excel
              </button>
            </>
          )}
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {state.rooms.length} room{state.rooms.length === 1 ? '' : 's'}
          </span>
        </div>

        {matrix ? (
          <div className="scroll-x" style={{ paddingTop: 0 }}>
            <table className="grid nowrap">
              <thead>
                <tr>
                  <th>Level</th><th>Area</th><th>Room No.</th>
                  {state.room_types.map((rt) => (
                    <th key={rt.idx} className="num" title={rt.name} style={{ minWidth: 62 }}>
                      <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{rt.class}</div>
                      {rt.name.replace('SYSTEM TYPE', 'T')}
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {state.rooms.map((room, i) => (
                  <tr key={i}>
                    {roomFields(room, i)}
                    {state.room_types.map((rt) => (
                      <td key={rt.idx} className="num qtycell">
                        <NumInput
                          value={matrixQty(room, rt.idx)}
                          format={numFmt}
                          parse={numParse}
                          onValue={(n) => setMatrixQty(i, rt.idx, n)}
                          histKey={`room:${i}:type:${rt.idx}`}
                        />
                      </td>
                    ))}
                    <td><button className="btn minus" onClick={() => update((dr) => dr.rooms.splice(i, 1))}>−</button></td>
                  </tr>
                ))}
                <tr className="sec-head">
                  <td colSpan={3}>Total rooms per type</td>
                  {state.room_types.map((rt) => (
                    <td key={rt.idx} className="num">{counts[rt.idx] || ''}</td>
                  ))}
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>Level</th><th>Area</th><th>Room No.</th><th>System type(s) &amp; quantity</th><th></th>
              </tr>
            </thead>
            <tbody>
              {state.rooms.map((room, i) => (
                <tr key={i}>
                  {roomFields(room, i)}
                  <td>
                    {room.types.length === 0 && (
                      <span style={{ color: 'var(--muted)', fontSize: 12, marginRight: 8 }}>— unassigned —</span>
                    )}
                    {room.types.map((rt, ti) => (
                      <div key={ti} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                        <select value={rt.type_idx} onChange={(e) => setRoomTypeIdx(i, ti, Number(e.target.value))}>
                          {state.room_types.map((t) => (
                            <option key={t.idx} value={t.idx}>{t.name}</option>
                          ))}
                        </select>
                        <input
                          type="number" min={0} value={rt.qty} title="Quantity" style={{ width: 56 }}
                          onChange={(e) => setRoomTypeQty(i, ti, Number(e.target.value) || 0)}
                        />
                        <button className="btn minus" title="Remove this type" onClick={() => removeRoomType(i, ti)}>−</button>
                      </div>
                    ))}
                    <button
                      className="btn secondary" style={{ padding: '2px 10px', fontSize: 12 }}
                      onClick={() => addRoomType(i)} disabled={!state.room_types.length}
                    >
                      + type
                    </button>
                  </td>
                  <td><button className="btn minus" onClick={() => update((dr) => dr.rooms.splice(i, 1))}>−</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
