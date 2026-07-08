import { useProject, fmtMoney, pctIn, pctOut, toDisplayNum, fromDisplayNum, numFmt, numParse } from '../state';
import { settingsOf, lmDerived, lmQty, roomTypeCounts } from '@shared/engine';
import type { LmItem, LmKind } from '@shared/types';
import NumInput from '../components/NumInput';

/** Map workbook categories into the display sections requested. */
const SECTIONS: { title: string; match: (i: LmItem) => boolean; defaultCategory: string; kind: LmKind }[] = [
  { title: 'Design & Engineering', match: (i) => /design/i.test(i.category ?? ''), defaultCategory: 'Design and Engineering', kind: 'labour' },
  { title: 'Installation', match: (i) => /install/i.test(i.category ?? ''), defaultCategory: 'Installation ', kind: 'labour' },
  { title: 'Site Costs', match: (i) => /site/i.test(i.category ?? ''), defaultCategory: 'Site costs', kind: 'labour' },
  { title: 'Commissioning', match: (i) => /testing|commissioning|programming/i.test(i.category ?? ''), defaultCategory: 'Testing & commissioning', kind: 'labour' },
  { title: 'Project Management', match: (i) => /project management/i.test(i.category ?? ''), defaultCategory: 'Project management', kind: 'labour' },
  { title: 'Warranty, Support & Maintenance', match: (i) => /warranty/i.test(i.category ?? ''), defaultCategory: 'Warranty, support, & maintenance', kind: 'labour' },
  { title: 'Cables', match: (i) => i.kind === 'cable', defaultCategory: 'Cables', kind: 'cable' },
  { title: 'Parts & Materials', match: (i) => i.kind === 'part', defaultCategory: 'Parts & Materials', kind: 'part' },
];

const COMMISSIONING_CATEGORIES = ['Testing & commissioning', 'Programming'];

export default function LabourMaterials() {
  const { state, update } = useProject();
  if (!state) return null;
  const s = settingsOf(state);
  const counts = roomTypeCounts(state);

  const assigned = new Set<number>();
  const groups = SECTIONS.map((sec) => {
    const rows: [LmItem, number][] = [];
    state.labour_materials.forEach((item, i) => {
      if (assigned.has(i)) return;
      // cables/parts only land in their kind sections; labour matched by category
      const kindOk = sec.kind === 'labour' ? item.kind === 'labour' : item.kind === sec.kind;
      if (kindOk && sec.match(item)) {
        rows.push([item, i]);
        assigned.add(i);
      }
    });
    return { ...sec, rows };
  });
  const leftovers: [LmItem, number][] = [];
  state.labour_materials.forEach((item, i) => {
    if (!assigned.has(i)) leftovers.push([item, i]);
  });

  // Back-solve helpers — storage stays in base currency (labour: sell; others: markup).
  // Values arrive already parsed from NumInput (money in base currency, % as a fraction).
  const contOf = (it: LmItem) =>
    state.categories.find((c) => c.name === (it.category ?? ''))?.contingency ?? 0;

  const setCost = (i: number, n: number | null) =>
    update((dr) => (dr.labour_materials[i].cost = n));

  const setMarkupFrac = (i: number, frac: number | null) =>
    update((dr) => {
      const it = dr.labour_materials[i];
      const m = frac ?? 0;
      const cont = contOf(it);
      if (it.kind === 'labour') it.sell_entered = (it.cost ?? 0) * (1 + m + cont);
      else it.markup_entered = m;
    });

  const setSellBase = (i: number, sellBase: number | null) =>
    update((dr) => {
      const it = dr.labour_materials[i];
      const sell = sellBase ?? 0;
      const cont = contOf(it);
      if (it.kind === 'labour') it.sell_entered = sell;
      else it.markup_entered = it.cost ? sell / it.cost - 1 - cont : 0;
    });

  const setMarginFrac = (i: number, frac: number | null) =>
    update((dr) => {
      const it = dr.labour_materials[i];
      const margin = frac ?? 0;
      if (margin >= 1) return; // impossible margin
      const cost = it.cost ?? 0;
      const sell = margin === 0 ? cost : cost / (1 - margin);
      const cont = contOf(it);
      if (it.kind === 'labour') it.sell_entered = sell;
      else it.markup_entered = cost ? sell / cost - 1 - cont : 0;
    });

  const renderRows = (rows: [LmItem, number][], showCategory: boolean) => (
    <div className="scroll-x">
      <table className="grid nowrap">
        <thead>
          <tr>
            {showCategory && <th>Category</th>}
            <th style={{ minWidth: 190 }}>Component</th>
            <th style={{ minWidth: 170 }}>Particular</th>
            <th>Unit</th>
            <th className="num">Cost</th>
            <th className="num">Mark-up %</th>
            <th className="num">Sell</th>
            <th className="num">Margin %</th>
            <th className="num">Qty</th>
            <th className="num">Σ Sell</th>
            {state.room_types.map((rt) => (
              <th key={rt.idx} className="num" title={rt.name}>
                {rt.name.replace('SYSTEM TYPE', 'T')}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([item, i]) => {
            const d = lmDerived(item, s);
            const qty = lmQty(item, counts);
            return (
              <tr key={i}>
                {showCategory && (
                  <td>
                    <select
                      value={item.category ?? ''}
                      onChange={(e) =>
                        update((dr) => (dr.labour_materials[i].category = e.target.value))
                      }
                    >
                      {COMMISSIONING_CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="desc">
                  <input
                    value={item.component ?? ''}
                    onChange={(e) =>
                      update((dr) => (dr.labour_materials[i].component = e.target.value))
                    }
                  />
                </td>
                <td className="desc">
                  <input
                    value={item.particular ?? ''}
                    onChange={(e) =>
                      update((dr) => (dr.labour_materials[i].particular = e.target.value))
                    }
                  />
                </td>
                <td>{item.measurement}</td>
                <td className="num">
                  <NumInput
                    value={item.cost}
                    format={toDisplayNum}
                    parse={fromDisplayNum}
                    onValue={(n) => setCost(i, n)}
                    histKey={`lm:${item.row}:cost`}
                  />
                </td>
                <td className="num">
                  <NumInput
                    value={d.markup}
                    format={pctIn}
                    parse={pctOut}
                    onValue={(n) => setMarkupFrac(i, n)}
                    histKey={`lm:${item.row}:markup`}
                  />
                </td>
                <td className="num">
                  <NumInput
                    value={d.sell}
                    format={toDisplayNum}
                    parse={fromDisplayNum}
                    onValue={(n) => setSellBase(i, n)}
                    histKey={`lm:${item.row}:sell`}
                  />
                </td>
                <td className="num">
                  <NumInput
                    value={d.margin}
                    format={pctIn}
                    parse={pctOut}
                    onValue={(n) => setMarginFrac(i, n)}
                    histKey={`lm:${item.row}:margin`}
                  />
                </td>
                <td className="num">{qty || ''}</td>
                <td className="num">{qty ? fmtMoney(d.sell * qty) : ''}</td>
                {state.room_types.map((rt) => (
                  <td key={rt.idx} className="num qtycell">
                    <NumInput
                      value={item.allocations[String(rt.idx)] ?? null}
                      format={numFmt}
                      parse={numParse}
                      onValue={(n) =>
                        update((dr) => {
                          if (n == null || n === 0) delete dr.labour_materials[i].allocations[String(rt.idx)];
                          else dr.labour_materials[i].allocations[String(rt.idx)] = n;
                        })
                      }
                      histKey={`lm:${item.row}:alloc:${rt.idx}`}
                    />
                  </td>
                ))}
                <td>
                  <button
                    className="btn minus"
                    title="Remove line"
                    onClick={() => update((dr) => dr.labour_materials.splice(i, 1))}
                  >
                    −
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <h1>Labour & Materials</h1>
      <div className="subtitle">
        Cost, mark-up, sell and margin are all editable — change any one and the others follow.
      </div>

      {groups.map((sec) => (
        <div className="lm-section" key={sec.title}>
          <h2>{sec.title}</h2>
          {renderRows(sec.rows, sec.title === 'Commissioning')}
          <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
            <button
              className="btn secondary"
              onClick={() =>
                update((dr) => {
                  const maxRow = Math.max(0, ...dr.labour_materials.map((x) => x.row));
                  const lastIdx = sec.rows.length
                    ? sec.rows[sec.rows.length - 1][1] + 1
                    : dr.labour_materials.length;
                  dr.labour_materials.splice(lastIdx, 0, {
                    row: maxRow + 1,
                    kind: sec.kind,
                    category: sec.defaultCategory,
                    component: '',
                    particular: '',
                    brand: null,
                    measurement: sec.kind === 'labour' ? 'Per Hour' : 'Per Item',
                    cost: null,
                    markup_entered: sec.kind === 'labour' ? null : 0.45,
                    sell_entered: sec.kind === 'labour' ? 0 : null,
                    allocations: {},
                  });
                })
              }
            >
              + Add line
            </button>
          </div>
        </div>
      ))}

      {leftovers.length > 0 && (
        <div className="lm-section">
          <h2>Other</h2>
          {renderRows(leftovers, false)}
        </div>
      )}
    </>
  );
}
