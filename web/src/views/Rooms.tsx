import { useRef, useState } from 'react';
import { useProject, numFmt, numParse, isEmbedded } from '../state';
import { startRowDrag, endRowDrag } from '../dragGhost';
import { moveByDrop } from '../reorder';
import { selectRow } from '../gridSelection';
import { roomTypeCounts } from '@shared/engine';
import NumInput from '../components/NumInput';
import type { Room } from '@shared/types';

export default function Rooms() {
  const { state, update, path, dirty, saveNow } = useProject();
  const [dragType, setDragType] = useState<number | null>(null);
  if (!state) return null;
  const counts = roomTypeCounts(state);
  const types = state.room_types;

  const addType = () =>
    update((dr) => {
      dr.room_types.push({ idx: dr.room_types.length, name: `SYSTEM TYPE ${dr.room_types.length}`, class: 'Standard' });
    });

  const renameType = (idx: number, name: string) =>
    update((dr) => (dr.room_types[idx].name = name));

  const removeType = (idx: number) =>
    update((dr) => {
      dr.room_types = dr.room_types.filter((t) => t.idx !== idx);
      dr.room_types.forEach((t, i) => (t.idx = i));
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

  // Duplicate a type column to its right, copying every value that references it:
  // the equipment/labour allocations and the per-room quantities in that column.
  const duplicateType = (srcIdx: number) =>
    update((dr) => {
      const arr = dr.room_types;
      const srcPos = arr.findIndex((t) => t.idx === srcIdx);
      if (srcPos < 0) return;
      const src = arr[srcPos];
      const newType = { ...src, name: `${src.name} (copy)` };
      arr.splice(srcPos + 1, 0, newType);
      // old idx -> new idx for the pre-existing types (everything after src shifts +1)
      const map = new Map<number, number>();
      arr.forEach((t, i) => { if (t !== newType) map.set(t.idx, i); });
      arr.forEach((t, i) => (t.idx = i));
      const newIdx = srcPos + 1; // the duplicate's new index (== its position)
      const remap = (alloc: Record<string, number>) => {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(alloc)) {
          const n = map.get(+k);
          if (n != null) out[String(n)] = v;
        }
        const srcNew = map.get(srcIdx);
        if (srcNew != null && out[String(srcNew)] != null) out[String(newIdx)] = out[String(srcNew)];
        return out;
      };
      dr.catalogue.forEach((it) => (it.allocations = remap(it.allocations)));
      dr.labour_materials.forEach((it) => (it.allocations = remap(it.allocations)));
      dr.rooms.forEach((r) => {
        const remapped = r.types.map((rt) => ({ ...rt, type_idx: map.get(rt.type_idx) ?? rt.type_idx }));
        const srcNew = map.get(srcIdx);
        const assign = remapped.find((rt) => rt.type_idx === srcNew);
        if (assign) remapped.push({ type_idx: newIdx, qty: assign.qty });
        r.types = remapped;
      });
    });

  // Reorder a type column, remapping every reference (rooms + allocations).
  const moveType = (from: number, to: number) =>
    update((dr) => {
      if (from === to) return;
      const arr = dr.room_types;
      const fromPos = arr.findIndex((t) => t.idx === from);
      const toPos = arr.findIndex((t) => t.idx === to);
      if (fromPos < 0 || toPos < 0) return;
      const [moved] = arr.splice(fromPos, 1);
      arr.splice(toPos, 0, moved);
      const map = new Map<number, number>(); // old idx -> new position
      arr.forEach((t, i) => map.set(t.idx, i));
      arr.forEach((t, i) => (t.idx = i));
      const remap = (alloc: Record<string, number>) => {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(alloc)) {
          const n = map.get(+k);
          if (n != null) out[String(n)] = v;
        }
        return out;
      };
      dr.catalogue.forEach((it) => (it.allocations = remap(it.allocations)));
      dr.labour_materials.forEach((it) => (it.allocations = remap(it.allocations)));
      dr.rooms.forEach((r) => (r.types = r.types.map((rt) => ({ ...rt, type_idx: map.get(rt.type_idx) ?? rt.type_idx }))));
    });

  const addRooms = (n: number) =>
    update((dr) => {
      for (let i = 0; i < n; i++) dr.rooms.push({ level: '', area: '', room_no: '', types: [] });
    });
  const removeRoom = (i: number) => update((dr) => dr.rooms.splice(i, 1));

  // Drag a room row (grab the ⠿ handle) to reorder the room list.
  const dragRoom = useRef<number | null>(null);
  const reorderRoom = (targetI: number) => {
    const from = dragRoom.current;
    dragRoom.current = null;
    if (from == null || from === targetI) return;
    update((dr) => moveByDrop(dr.rooms, from, targetI));
  };

  const matrixQty = (room: Room, typeIdx: number) =>
    room.types.find((t) => t.type_idx === typeIdx)?.qty ?? null;
  const setMatrixQty = (ri: number, typeIdx: number, n: number | null) =>
    update((dr) => {
      const arr = dr.rooms[ri].types;
      const ex = arr.find((t) => t.type_idx === typeIdx);
      if (n == null || n === 0) dr.rooms[ri].types = arr.filter((t) => t.type_idx !== typeIdx);
      else if (ex) ex.qty = n;
      else arr.push({ type_idx: typeIdx, qty: n });
    });

  // Export the matrix as a site document (letterhead + project/client details, no pricing).
  const exportMatrix = async (base: 'pdf' | 'xlsx') => {
    if (!path) return;
    if (dirty) await saveNow();
    window.open(`/api/${base}?path=${encodeURIComponent(path)}&doc=matrix`, '_blank');
  };

  return (
    <>
      <h1>Room Matrix</h1>
      <div className="subtitle">
        Rooms down the side, system types across the top — enter a quantity in each cell. The
        <b> COUNT</b> row totals each type. Copy/paste blocks with Excel; drag <b>⠿</b> to reorder types.
      </div>

      <div className="panel">
        {!isEmbedded && path && (
          <div className="toolbar" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
            <button className="btn secondary" onClick={() => exportMatrix('pdf')} title="Room matrix as PDF (letterhead + project details, no pricing)">⬇ Export PDF</button>
            <button className="btn secondary" onClick={() => exportMatrix('xlsx')} title="Room matrix as Excel (no pricing)">⬇ Export Excel</button>
          </div>
        )}

        <div className="scroll-x">
          <table className="grid room-matrix nowrap">
            <thead>
              <tr>
                <th className="dragcol"></th>
                <th className="mx-rownum"></th>
                <th>Level</th><th>Area</th><th>Room No.</th>
                {types.map((rt) => (
                  <th
                    key={rt.idx}
                    className={'mx-type' + (dragType != null && dragType !== rt.idx ? ' mx-drop' : '')}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragType != null) moveType(dragType, rt.idx); setDragType(null); }}
                  >
                    <div className="mx-type-head">
                      <span className="mx-drag" draggable onDragStart={() => setDragType(rt.idx)} onDragEnd={() => setDragType(null)} title="Drag to reorder">⠿</span>
                      <input value={rt.name} title={rt.name} onChange={(e) => renameType(rt.idx, e.target.value)} />
                      <button className="mx-col-dup" title="Duplicate this type to the right (copies its values)" onClick={() => duplicateType(rt.idx)}>D</button>
                      <button className="btn minus mx-col-del" title="Remove type" onClick={() => removeType(rt.idx)}>−</button>
                    </div>
                  </th>
                ))}
                <th className="mx-add"><button className="btn secondary" title="Add system type" onClick={addType}>+</button></th>
              </tr>
            </thead>
            <tbody>
              {state.rooms.map((room, i) => (
                <tr key={i} onDragOver={(e) => e.preventDefault()} onDrop={() => reorderRoom(i)}>
                  <td className="dragcell">
                    <span
                      className="drag-handle"
                      draggable
                      title="Drag to reorder — click to select the whole row"
                      onDragStart={(e) => { dragRoom.current = i; startRowDrag(e); }}
                      onDragEnd={(e) => { dragRoom.current = null; endRowDrag(e); }}
                      onClick={(e) => selectRow((e.currentTarget as HTMLElement).closest('tr')!)}
                    >
                      ⠿
                    </span>
                  </td>
                  <td className="mx-rownum">{i + 1}</td>
                  <td><input value={room.level ?? ''} onChange={(e) => update((dr) => (dr.rooms[i].level = e.target.value))} /></td>
                  <td><input value={room.area ?? ''} onChange={(e) => update((dr) => (dr.rooms[i].area = e.target.value))} /></td>
                  <td><input value={room.room_no ?? ''} onChange={(e) => update((dr) => (dr.rooms[i].room_no = e.target.value))} /></td>
                  {types.map((rt) => (
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
                  <td className="mx-del"><button className="btn minus" title="Remove room" onClick={() => removeRoom(i)}>−</button></td>
                </tr>
              ))}
              <tr className="mx-count">
                <td className="dragcell"></td>
                <td className="mx-rownum"><button className="btn secondary mx-addrow" title="Add room" onClick={() => addRooms(1)}>+</button></td>
                <td colSpan={3}>COUNT</td>
                {types.map((rt) => <td key={rt.idx} className="num">{counts[rt.idx] || '–'}</td>)}
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="toolbar" style={{ marginTop: 10 }}>
          <button className="btn secondary" onClick={() => addRooms(5)}>+ 5 rooms</button>
          <button className="btn secondary" onClick={() => addRooms(10)}>+ 10 rooms</button>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {state.rooms.length} room{state.rooms.length === 1 ? '' : 's'} · {types.length} type{types.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </>
  );
}
