import { useRef, useState } from 'react';
import { useProject, fmtMoney, pctIn, pctOut, toDisplayNum, fromDisplayNum, numFmt, numParse, isEmbedded } from '../state';
import { settingsOf, lmDerived, lmQty, roomTypeCounts } from '@shared/engine';
import type { LmItem, LmKind } from '@shared/types';
import NumInput from '../components/NumInput';
import { downloadJson, listFilename } from '../listIo';
import { startRowDrag, endRowDrag } from '../dragGhost';
import { moveByDrop } from '../reorder';
import { selectRow } from '../gridSelection';

/** Map workbook categories into the display sections requested. */
const SECTIONS: { title: string; match: (i: LmItem) => boolean; defaultCategory: string; kind: LmKind }[] = [
  { title: 'Design & Engineering', match: (i) => /design/i.test(i.category ?? ''), defaultCategory: 'Design and Engineering', kind: 'labour' },
  { title: 'Installation', match: (i) => /install/i.test(i.category ?? ''), defaultCategory: 'Installation', kind: 'labour' },
  { title: 'Site Costs', match: (i) => /site/i.test(i.category ?? ''), defaultCategory: 'Site costs', kind: 'labour' },
  { title: 'Commissioning', match: (i) => /testing|commissioning|programming/i.test(i.category ?? ''), defaultCategory: 'Testing & commissioning', kind: 'labour' },
  { title: 'Project Management', match: (i) => /project management/i.test(i.category ?? ''), defaultCategory: 'Project management', kind: 'labour' },
  { title: 'Warranty, Support & Maintenance', match: (i) => /warranty/i.test(i.category ?? ''), defaultCategory: 'Warranty, support, & maintenance', kind: 'labour' },
  { title: 'Cables', match: (i) => i.kind === 'cable', defaultCategory: 'Cables', kind: 'cable' },
  { title: 'Parts & Materials', match: (i) => i.kind === 'part', defaultCategory: 'Parts & Materials', kind: 'part' },
];

const COMMISSIONING_CATEGORIES = ['Testing & commissioning', 'Programming'];

export default function LabourMaterials({ orphanFilter = false }: { orphanFilter?: boolean }) {
  const { state, update } = useProject();
  const [confirmClear, setConfirmClear] = useState(false);
  const [importing, setImporting] = useState(false);
  if (!state) return null;
  const s = settingsOf(state);
  const counts = roomTypeCounts(state);

  // Two-stage clear: first click arms, second click within 4s clears everything.
  const clearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    update((dr) => (dr.labour_materials = []));
  };

  // Export the current L&M list, or import one — from a spreadsheet, a .json
  // export, or a previous .qmproj project.
  const exportList = () =>
    downloadJson(state.labour_materials, listFilename('LabourMaterials', state.details.project_name));
  const importList = async () => {
    const r = await fetch('/api/browse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'list' }),
    });
    const { path: file } = await r.json();
    if (!file) return;
    setImporting(true);
    try {
      const res = await fetch('/api/lm/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file }),
      });
      const data = await res.json();
      if (!res.ok) { window.alert(data.error || 'Import failed'); return; }
      const matched = data.mapped?.length ? ` (matched: ${data.mapped.join(', ')})` : '';
      if (!window.confirm(`Import ${data.items.length} lines${matched}? This replaces the current Labour & Materials list.`)) return;
      update((dr) => (dr.labour_materials = data.items.map((it: LmItem, i: number) => ({ ...it, row: it.row ?? i + 1, allocations: it.allocations ?? {} }))));
    } finally {
      setImporting(false);
    }
  };

  // Save the current L&M list as the default applied to new projects.
  const setAsDefault = async () => {
    if (!window.confirm('Save the current Labour & Materials list as the default for all NEW projects?')) return;
    const res = await fetch('/api/lm/set-default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labour_materials: state.labour_materials }),
    });
    const data = await res.json();
    if (res.ok) window.alert(`Saved ${data.count} lines as the default Labour & Materials list.`);
  };

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

  // Which section each row belongs to — used to keep drag-reorder inside a section.
  const sectionOfIndex = new Map<number, string>();
  groups.forEach((g) => g.rows.forEach(([, i]) => sectionOfIndex.set(i, g.title)));
  leftovers.forEach(([, i]) => sectionOfIndex.set(i, 'Other'));

  // "Show affected rows": keep only rows with a value against a room-less type.
  const orphanTypeIdx = state.room_types.filter((rt) => (counts[rt.idx] ?? 0) === 0).map((rt) => rt.idx);
  const isAffected = (it: LmItem) => orphanTypeIdx.some((idx) => it.allocations[String(idx)] != null);
  const shownGroups = orphanFilter
    ? groups.map((g) => ({ ...g, rows: g.rows.filter(([it]) => isAffected(it)) })).filter((g) => g.rows.length)
    : groups;
  const shownLeftovers = orphanFilter ? leftovers.filter(([it]) => isAffected(it)) : leftovers;

  // Back-solve helpers — storage stays in base currency (labour: sell; others: markup).
  // Values arrive already parsed from NumInput (money in base currency, % as a fraction).
  const contOf = (it: LmItem) =>
    state.categories.find((c) => c.name === (it.category ?? ''))?.contingency ?? 0;

  const setCost = (i: number, n: number | null) =>
    update((dr) => (dr.labour_materials[i].cost = n));

  // Drag-to-reorder within a section (grab the ⠿ handle, drop on another row).
  const dragLm = useRef<number | null>(null);
  const reorderLm = (targetI: number) => {
    const from = dragLm.current;
    dragLm.current = null;
    if (from == null || from === targetI) return;
    if (sectionOfIndex.get(from) !== sectionOfIndex.get(targetI)) return;
    update((dr) => moveByDrop(dr.labour_materials, from, targetI));
  };

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
            <th className="dragcol"></th>
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
              <th key={rt.idx} className="num type-col" title={rt.name}>
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
              <tr key={i} onDragOver={(e) => e.preventDefault()} onDrop={() => reorderLm(i)}>
                <td className="dragcell">
                  <span
                    className="drag-handle"
                    draggable
                    title="Drag to reorder — click to select the whole row"
                    onDragStart={(e) => { dragLm.current = i; startRowDrag(e); }}
                    onDragEnd={(e) => { dragLm.current = null; endRowDrag(e); }}
                    onClick={(e) => selectRow((e.currentTarget as HTMLElement).closest('tr')!)}
                  >
                    ⠿
                  </span>
                </td>
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
                    integer
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
                    integer
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
                      className={counts[rt.idx] === 0 && item.allocations[String(rt.idx)] != null ? 'orphan-alloc' : ''}
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

      <div className="toolbar">
        <button className={confirmClear ? 'btn danger' : 'btn secondary'} onClick={clearAll}>
          {confirmClear ? '⚠ Click again to clear ALL lines' : 'Clear all lines'}
        </button>
        {!isEmbedded && (
          <button className="btn secondary" onClick={importList} disabled={importing} title="Load a list from a spreadsheet, an export, or a previous .qmproj project">
            {importing ? 'Importing…' : 'Import list…'}
          </button>
        )}
        <button className="btn secondary" onClick={exportList} disabled={state.labour_materials.length === 0}>
          Export list
        </button>
        {!isEmbedded && (
          <button className="btn secondary" onClick={setAsDefault} title="Use this list as the default for new projects">
            Set as default
          </button>
        )}
      </div>

      {orphanFilter && shownGroups.length === 0 && shownLeftovers.length === 0 && (
        <div className="panel">No affected Labour &amp; Materials rows.</div>
      )}

      {shownGroups.map((sec) => (
        <div className="lm-section" key={sec.title}>
          <h2>{sec.title}</h2>
          {renderRows(sec.rows, sec.title === 'Commissioning')}
          {!orphanFilter && (
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
          )}
        </div>
      ))}

      {shownLeftovers.length > 0 && (
        <div className="lm-section">
          <h2>Other</h2>
          {renderRows(shownLeftovers, false)}
        </div>
      )}
    </>
  );
}
