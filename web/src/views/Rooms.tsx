import { useProject, fmtMoney } from '../state';
import { settingsOf, perRoomType, roomTypeCounts } from '@shared/engine';

export default function Rooms() {
  const { state, update } = useProject();
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
        const old = t.idx;
        t.idx = i;
        // re-key allocations & rooms referencing shifted indices
        const remap = (alloc: Record<string, number>) => {
          const out: Record<string, number> = {};
          for (const [k, v] of Object.entries(alloc)) {
            const n = +k;
            if (n === idx) continue;
            out[String(n > idx ? n - 1 : n)] = v;
          }
          return out;
        };
        void old;
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

  return (
    <>
      <h1>Rooms & System Types</h1>
      <div className="subtitle">
        Define system types, then assign each physical room to a type. Quantities flow from here
        into every calculation.
      </div>

      <div className="panel">
        <h2>System Types</h2>
        <div className="toolbar">
          <button className="btn" onClick={addType}>+ Add system type</button>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Class</th>
              <th className="num">Rooms</th>
              <th className="num">Cost / room</th>
              <th className="num">Sell / room</th>
              <th className="num">Power (W)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.room_types.map((rt) => (
              <tr key={rt.idx}>
                <td>
                  <input
                    value={rt.name}
                    onChange={(e) =>
                      update((dr) => (dr.room_types[rt.idx].name = e.target.value))
                    }
                  />
                </td>
                <td>
                  <select
                    value={rt.class}
                    onChange={(e) =>
                      update((dr) => (dr.room_types[rt.idx].class = e.target.value as any))
                    }
                  >
                    <option>Standard</option>
                    <option>Unique</option>
                  </select>
                </td>
                <td className="num">{counts[rt.idx]}</td>
                <td className="num">{fmtMoney(per.totalCost[rt.idx])}</td>
                <td className="num">{fmtMoney(per.totalSell[rt.idx])}</td>
                <td className="num">{per.power[rt.idx].toFixed(0)}</td>
                <td>
                  <button className="btn minus" onClick={() => removeType(rt.idx)}>−</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Physical Rooms</h2>
        <div className="toolbar">
          <button className="btn" onClick={() => addRooms(1)}>+ Add room</button>
          <button className="btn secondary" onClick={() => addRooms(5)}>+ 5</button>
          <button className="btn secondary" onClick={() => addRooms(10)}>+ 10</button>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {state.rooms.length} room{state.rooms.length === 1 ? '' : 's'}
          </span>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Level</th>
              <th>Area</th>
              <th>Room No.</th>
              <th>System type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.rooms.map((room, i) => (
              <tr key={i}>
                <td>
                  <input
                    value={room.level ?? ''}
                    onChange={(e) => update((dr) => (dr.rooms[i].level = e.target.value))}
                  />
                </td>
                <td>
                  <input
                    value={room.area ?? ''}
                    onChange={(e) => update((dr) => (dr.rooms[i].area = e.target.value))}
                  />
                </td>
                <td>
                  <input
                    value={room.room_no ?? ''}
                    onChange={(e) => update((dr) => (dr.rooms[i].room_no = e.target.value))}
                  />
                </td>
                <td>
                  <select
                    value={room.types[0]?.type_idx ?? -1}
                    onChange={(e) =>
                      update((dr) => {
                        const v = Number(e.target.value);
                        dr.rooms[i].types = v >= 0 ? [{ type_idx: v, qty: 1 }] : [];
                      })
                    }
                  >
                    <option value={-1}>— unassigned —</option>
                    {state.room_types.map((rt) => (
                      <option key={rt.idx} value={rt.idx}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className="btn minus"
                    onClick={() => update((dr) => dr.rooms.splice(i, 1))}
                  >
                    −
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
