import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useProject, fmtMoney, fmtPct, pctIn, pctOut, toDisplayNum, fromDisplayNum, numFmt, numParse, isEmbedded,
} from '../state';
import { settingsOf, itemSell, itemMargin, itemQty, roomTypeCounts } from '@shared/engine';
import type { CatalogueItem } from '@shared/types';
import NumInput from '../components/NumInput';
import { downloadJson, listFilename } from '../listIo';
import { startRowDrag, endRowDrag } from '../dragGhost';
import { moveByDrop } from '../reorder';
import { selectRow } from '../gridSelection';

// Fixed (non-system-type) columns, in order — drives the Filters show/hide menu.
const COLS: { key: string; title: string }[] = [
  { key: 'desc', title: 'Description' },
  { key: 'part', title: 'Part #' },
  { key: 'brand', title: 'Brand' },
  { key: 'supplier', title: 'Supplier' },
  { key: 'cost', title: 'Cost' },
  { key: 'markup', title: 'Mark-up %' },
  { key: 'markupcont', title: 'Mark-up + Cont %' },
  { key: 'sell', title: 'Sell' },
  { key: 'margin', title: 'Margin %' },
  { key: 'qty', title: 'Qty' },
  { key: 'sumsell', title: 'Σ Sell' },
];
const FROZEN_KEYS = ['desc', 'part', 'brand', 'supplier'];

// Tasteful highlight colours for the manual cell-colour buttons.
const CELL_COLORS: { name: string; hex: string }[] = [
  { name: 'Red', hex: '#d9534f' },
  { name: 'Yellow', hex: '#e0a92e' },
  { name: 'Green', hex: '#3fa46a' },
  { name: 'Blue', hex: '#3f83d6' },
];

interface PriceMatch {
  itemRow: number;
  matchedOn: 'part_number' | 'description';
  matchedText: string;
  sheet: string;
  currentCost: number | null;
  newPrice: number;
  priceHeader?: string;
}

function PricelistPanel() {
  const { state, update } = useProject();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, PriceMatch[] | { error: string }>>({});
  if (!state) return null;

  const suppliers = [...new Set(state.catalogue.map((i) => i.supplier).filter(Boolean))] as string[];
  const paths = state.supplier_pricelists ?? {};

  const setPath = (sup: string, val: string) =>
    update((dr) => {
      dr.supplier_pricelists = { ...(dr.supplier_pricelists ?? {}), [sup]: val };
    });

  const browse = async (sup: string) => {
    const r = await fetch('/api/browse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'pricelist' }),
    });
    const { path } = await r.json();
    if (path) setPath(sup, path);
  };

  const check = async (supplier: string) => {
    setBusy(supplier);
    try {
      const items = state.catalogue
        .filter((i) => i.supplier === supplier)
        .map((i) => ({ row: i.row, part_number: i.part_number, description: i.description, cost: i.cost }));
      const r = await fetch('/api/pricelist/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: paths[supplier], items }),
      });
      const data = await r.json();
      setResults((prev) => ({ ...prev, [supplier]: r.ok ? (data.matches as PriceMatch[]) : { error: data.error } }));
    } finally {
      setBusy(null);
    }
  };

  const apply = (supplier: string) => {
    const matches = results[supplier];
    if (!Array.isArray(matches)) return;
    update((dr) => {
      for (const m of matches) {
        const item = dr.catalogue.find((i) => i.row === m.itemRow);
        if (item) item.cost = m.newPrice;
      }
    });
    setResults((prev) => ({ ...prev, [supplier]: [] }));
  };

  return (
    <div className="panel">
      <h2 style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Supplier pricelists
      </h2>
      {open && (
        <div className="pricelist-note">
          ⚠ Prices are auto-matched to the <b>cheapest ex-GST</b> column found in the file. Always
          cross-check each change before applying — the “Review” list shows which column each price came from.
        </div>
      )}
      {open && (
        <table className="grid">
          <thead>
            <tr>
              <th>Supplier</th>
              <th style={{ width: '45%' }}>Pricelist file (.xlsx / .csv on this computer)</th>
              <th></th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((sup) => {
              const res = results[sup];
              return (
                <tr key={sup}>
                  <td>{sup}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        placeholder="Choose a pricelist file…"
                        value={paths[sup] ?? ''}
                        onChange={(e) => setPath(sup, e.target.value)}
                      />
                      {!isEmbedded && (
                        <button className="browse-btn" onClick={() => browse(sup)}>Browse…</button>
                      )}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn secondary"
                      disabled={!paths[sup] || busy === sup}
                      onClick={() => check(sup)}
                    >
                      {busy === sup ? 'Checking…' : 'Check prices'}
                    </button>{' '}
                    {Array.isArray(res) && res.length > 0 && (
                      <button className="btn" onClick={() => apply(sup)}>
                        Update {res.length} price{res.length === 1 ? '' : 's'}
                      </button>
                    )}
                  </td>
                  <td>
                    {res && 'error' in res && <span style={{ color: 'var(--bad)' }}>{res.error}</span>}
                    {Array.isArray(res) && res.length === 0 && <span>No changes</span>}
                    {Array.isArray(res) && res.length > 0 && (
                      <details>
                        <summary>{res.length} match{res.length === 1 ? '' : 'es'} found — review</summary>
                        <ul style={{ margin: '6px 0 0 18px' }}>
                          {res.map((m) => (
                            <li key={m.itemRow}>
                              {m.matchedText}{' '}
                              <em>({m.matchedOn.replace('_', ' ')}, {m.sheet}{m.priceHeader ? ` → “${m.priceHeader}”` : ''})</em>:{' '}
                              <span className="diff-old">{fmtMoney(m.currentCost ?? 0)}</span>
                              <span className="diff-new">{fmtMoney(m.newPrice)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Schedule({ orphanFilter = false }: { orphanFilter?: boolean }) {
  const { state, update } = useProject();
  const [section, setSection] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [showEmpty, setShowEmpty] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [scrollW, setScrollW] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClearColors, setConfirmClearColors] = useState(false);
  const [importing, setImporting] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  if (!state) return null;

  // Column show/hide (Filters menu). Hidden columns use display:none so cell
  // indices stay stable (cell colours / crosshair rely on them); the horizontal
  // freeze is only kept while all four identity columns are visible.
  const hiddenCol = (k: string) => hiddenCols.has(k);
  const cs = (k: string): React.CSSProperties | undefined => (hiddenCol(k) ? { display: 'none' } : undefined);
  const freezeOn = !FROZEN_KEYS.some(hiddenCol);
  const toggleCol = (k: string) =>
    setHiddenCols((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  // close the Filters dropdown when clicking anywhere outside it
  const filterRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = filterRef.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  const s = settingsOf(state);
  const counts = roomTypeCounts(state);
  const nCols = 11 + state.room_types.length;

  const sections = useMemo(
    () => ['All', ...new Set(state.catalogue.map((i) => i.section).filter(Boolean) as string[])],
    [state.catalogue],
  );

  // types no room uses — a value in one of these columns is the "error"
  const orphanTypeIdx = state.room_types.filter((rt) => (counts[rt.idx] ?? 0) === 0).map((rt) => rt.idx);
  const isAffected = (item: CatalogueItem) =>
    orphanTypeIdx.some((idx) => item.allocations[String(idx)] != null);

  const q = search.toLowerCase();
  const visible = state.catalogue
    .map((item, i) => [item, i] as [CatalogueItem, number])
    .filter(([item]) => {
      // "show affected rows" — only the error rows, ignoring the other filters
      if (orphanFilter) return isAffected(item);
      if (section !== 'All' && item.section !== section) return false;
      // "show unused" off hides only truly-unused rows: no qty AND not assigned
      // to any system type (an assigned-but-unpriced row still shows).
      if (!showEmpty && itemQty(item, counts) === 0 && Object.keys(item.allocations).length === 0)
        return false;
      if (
        q &&
        ![item.description, item.part_number, item.manufacturer, item.supplier, item.subcategory]
          .join(' ').toLowerCase().includes(q)
      )
        return false;
      return true;
    });

  // group by section, preserving first-appearance order (Custom is prepended so leads)
  const grouped: { section: string; rows: [CatalogueItem, number][] }[] = [];
  const idxOf = new Map<string, number>();
  for (const [item, i] of visible) {
    const sec = item.section || 'Uncategorised';
    let g = idxOf.get(sec);
    if (g == null) { g = grouped.length; idxOf.set(sec, g); grouped.push({ section: sec, rows: [] }); }
    grouped[g].rows.push([item, i]);
  }
  // Custom items always sit at the top of the list
  grouped.sort((a, b) => (a.section === 'Custom' ? -1 : b.section === 'Custom' ? 1 : 0));

  // ----- manual cell highlighting -----
  // Keys ("rowId:colIndex") of the currently selected schedule cells: the
  // spreadsheet range (.cell-sel) if any, otherwise the single focused cell.
  const selectedCellKeys = (): string[] => {
    const root = bottomRef.current;
    if (!root) return [];
    let cells = Array.from(root.querySelectorAll<HTMLTableCellElement>('td.cell-sel'));
    if (cells.length === 0) {
      const td = (document.activeElement as HTMLElement | null)?.closest?.('td') as HTMLTableCellElement | null;
      if (td && root.contains(td)) cells = [td];
    }
    const keys: string[] = [];
    for (const td of cells) {
      const rowId = (td.parentElement as HTMLElement | null)?.dataset?.row;
      if (rowId != null) keys.push(`${rowId}:${td.cellIndex}`);
    }
    return keys;
  };

  const applyColor = (hex: string) => {
    const keys = selectedCellKeys();
    if (!keys.length) return;
    update((dr) => {
      dr.cell_colors ??= {};
      for (const k of keys) dr.cell_colors[k] = hex;
    });
  };

  const clearColor = () => {
    const keys = selectedCellKeys();
    if (!keys.length || !state.cell_colors) return;
    update((dr) => {
      if (dr.cell_colors) for (const k of keys) delete dr.cell_colors[k];
    });
  };

  // Two-stage "Clear all": first click arms ("Sure?"), second clears.
  const clearAllColors = () => {
    if (!confirmClearColors) {
      setConfirmClearColors(true);
      setTimeout(() => setConfirmClearColors(false), 4000);
      return;
    }
    setConfirmClearColors(false);
    update((dr) => { dr.cell_colors = {}; });
  };

  // Paint the saved highlight colours onto their cells after each render.
  useEffect(() => {
    const root = bottomRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('td.uc-colored').forEach((td) => {
      td.classList.remove('uc-colored');
      td.style.outline = '';
      td.style.outlineOffset = '';
    });
    const colors = state.cell_colors;
    if (!colors) return;
    for (const [key, hex] of Object.entries(colors)) {
      const [rowId, colStr] = key.split(':');
      const tr = root.querySelector<HTMLTableRowElement>(`tr[data-row="${CSS.escape(rowId)}"]`);
      const td = tr?.cells[Number(colStr)] as HTMLElement | undefined;
      if (td) {
        td.style.outline = `2px solid ${hex}`;
        td.style.outlineOffset = '-2px';
        td.classList.add('uc-colored');
      }
    }
  });

  // keep the top scrollbar spacer sized to the table
  useEffect(() => {
    const b = bottomRef.current;
    if (!b) return;
    const measure = () => setScrollW(b.scrollWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    return () => ro.disconnect();
  }, [visible.length, collapsed, state.room_types.length]);

  const toggle = (sec: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      n.has(sec) ? n.delete(sec) : n.add(sec);
      return n;
    });

  const setAllocNum = (i: number, typeIdx: number, n: number | null) =>
    update((dr) => {
      if (n == null || n === 0) delete dr.catalogue[i].allocations[String(typeIdx)];
      else dr.catalogue[i].allocations[String(typeIdx)] = n;
    });

  // Drag-to-reorder: grab the ⠿ handle, drop on another row in the SAME section.
  const dragRow = useRef<number | null>(null);
  const reorderTo = (targetI: number) => {
    const from = dragRow.current;
    dragRow.current = null;
    if (from == null || from === targetI) return;
    update((dr) => {
      // reorder only within the same section
      if ((dr.catalogue[from]?.section || '') !== (dr.catalogue[targetI]?.section || '')) return;
      moveByDrop(dr.catalogue, from, targetI);
    });
  };

  // Add a blank row at the TOP of one section (the section's own "+ Add row").
  const addRowToSection = (sectionName: string) =>
    update((dr) => {
      const maxRow = Math.max(0, ...dr.catalogue.map((x) => x.row));
      const at = dr.catalogue.findIndex((x) => (x.section || 'Uncategorised') === sectionName);
      dr.catalogue.splice(at < 0 ? 0 : at, 0, {
        row: maxRow + 1,
        section: sectionName === 'Uncategorised' ? '' : sectionName,
        subcategory: '',
        description: '', part_number: '', power_load: null, dimensions: null, warranty: null,
        manufacturer: '', supplier: '', measurement: 'per item', cost: null, markup: 0.25,
        allocations: {},
      });
    });

  const addCustomItems = (n: number) =>
    update((dr) => {
      let maxRow = Math.max(0, ...dr.catalogue.map((x) => x.row));
      for (let k = 0; k < n; k++) {
        dr.catalogue.unshift({
          row: ++maxRow,
          section: 'Custom', subcategory: 'Custom Items',
          description: '', part_number: '', power_load: null, dimensions: null, warranty: null,
          manufacturer: '', supplier: '', measurement: 'per item', cost: null, markup: 0.25,
          allocations: {},
        });
      }
    });

  // Two-stage clear: first click arms, second click within 4s clears everything.
  const clearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    update((dr) => (dr.catalogue = []));
  };

  // Import an equipment list — from a spreadsheet (columns matched by header
  // keyword) OR a .json export / .qmproj project.
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
      const res = await fetch('/api/catalogue/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file }),
      });
      const data = await res.json();
      if (!res.ok) { window.alert(data.error || 'Import failed'); return; }
      const matched = data.mapped?.length ? ` (matched: ${data.mapped.join(', ')})` : '';
      if (!window.confirm(`Import ${data.items.length} items${matched}?\nThis replaces the current equipment list.`)) return;
      update((dr) => (dr.catalogue = data.items));
    } finally {
      setImporting(false);
    }
  };

  const setAsDefault = async () => {
    if (!window.confirm('Save the current equipment list as the default for all NEW projects?')) return;
    const res = await fetch('/api/catalogue/set-default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalogue: state.catalogue }),
    });
    const data = await res.json();
    if (res.ok) window.alert(`Saved ${data.count} items as the default equipment list.`);
  };

  const exportList = () =>
    downloadJson(state.catalogue, listFilename('Equipment', state.details.project_name));

  const syncFromTop = () => {
    if (bottomRef.current && topRef.current) bottomRef.current.scrollLeft = topRef.current.scrollLeft;
  };
  const syncFromBottom = () => {
    if (bottomRef.current && topRef.current) topRef.current.scrollLeft = bottomRef.current.scrollLeft;
  };

  return (
    <>
      <h1>Equipment Schedule</h1>
      <div className="subtitle">
        {state.catalogue.length} catalogue items. Edit Cost and Mark-up; Sell, Margin and Qty are
        calculated. Drag <b>⠿</b> to reorder within a section. First four columns stay put while scrolling.
      </div>

      <div className="toolbar">
        <button className={confirmClear ? 'btn danger' : 'btn secondary'} onClick={clearAll}>
          {confirmClear ? '⚠ Click again to clear ALL items' : 'Clear all items'}
        </button>
        {!isEmbedded && (
          <button className="btn secondary" onClick={importList} disabled={importing}>
            {importing ? 'Importing…' : 'Import list…'}
          </button>
        )}
        <button className="btn secondary" onClick={exportList} disabled={state.catalogue.length === 0}>
          Export list
        </button>
        {!isEmbedded && (
          <button className="btn secondary" onClick={setAsDefault} title="Use this list as the default for new projects">
            Set as default
          </button>
        )}
      </div>

      <PricelistPanel />

      <div className="sticky-toolbar">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            {sections.map((x) => <option key={x}>{x}</option>)}
          </select>
          <input
            placeholder="Search description / part / brand / supplier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 300 }}
          />
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />{' '}
            show unused
          </label>
          <details className="col-filter" ref={filterRef}>
            <summary className="btn secondary">Filters ▾</summary>
            <div className="col-filter-menu">
              <div className="col-filter-title">Show columns</div>
              {COLS.map((c) => (
                <label key={c.key}>
                  <input type="checkbox" checked={!hiddenCol(c.key)} onChange={() => toggleCol(c.key)} />
                  {c.title}
                </label>
              ))}
            </div>
          </details>
          <button className="btn secondary" onClick={() => addCustomItems(1)}>+ Add custom item</button>
          <button className="btn secondary" onClick={() => addCustomItems(5)} title="Add 5 custom items">+5</button>
          <button className="btn secondary" onClick={() => addCustomItems(10)} title="Add 10 custom items">+10</button>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{visible.length} rows</span>

          {/* cell-highlight colours — act on the current selection, so they must
              not clear it (.keep-selection) and keep focus on it (preventDefault) */}
          <div className="color-tools keep-selection" style={{ marginLeft: 'auto' }}>
            {CELL_COLORS.map((c) => (
              <button
                key={c.hex}
                className="color-swatch"
                style={{ background: c.hex }}
                title={`Highlight selected cells ${c.name.toLowerCase()}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyColor(c.hex)}
              />
            ))}
            <button
              className="btn secondary"
              title="Remove highlight from the selected cells"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearColor}
            >
              Clear
            </button>
            <button
              className={confirmClearColors ? 'btn danger' : 'btn secondary'}
              title="Remove every cell highlight"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearAllColors}
            >
              {confirmClearColors ? 'Sure?' : 'Clear all'}
            </button>
          </div>
        </div>
      </div>

      {/* synced horizontal scrollbar above the table */}
      <div className="scroll-top" ref={topRef} onScroll={syncFromTop}>
        <div style={{ width: scrollW }} />
      </div>

      <div className="panel scroll-x freeze-scroll" ref={bottomRef} onScroll={syncFromBottom} style={{ paddingTop: 0 }}>
        <table className={'grid nowrap' + (freezeOn ? ' freeze' : '')}>
          <thead>
            <tr>
              <th style={cs('desc')}>Description</th>
              <th style={cs('part')}>Part #</th>
              <th style={cs('brand')}>Brand</th>
              <th style={cs('supplier')}>Supplier</th>
              <th className="num" style={cs('cost')}>Cost</th>
              <th className="num" style={cs('markup')}>Mark-up %</th>
              <th className="num" style={cs('markupcont')} title="Mark-up plus this category's contingency">Mark-up + Cont %</th>
              <th className="num" style={cs('sell')}>Sell</th>
              <th className="num" style={cs('margin')}>Margin %</th>
              <th className="num" style={cs('qty')}>Qty</th>
              <th className="num" style={cs('sumsell')}>Σ Sell</th>
              {state.room_types.map((rt) => (
                <th key={rt.idx} className="num type-col" title={rt.name}>
                  {rt.name.replace('SYSTEM TYPE', 'T')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => {
              const isCollapsed = collapsed.has(g.section);
              const out: React.ReactNode[] = [
                <tr className="sec-head" key={'sec' + g.section} onClick={() => toggle(g.section)}>
                  <td colSpan={nCols}>
                    <span className="caret">{isCollapsed ? '▸' : '▾'}</span>
                    {g.section} <span style={{ opacity: 0.8, fontWeight: 400 }}>({g.rows.length})</span>
                    <button
                      className="sec-add"
                      title={`Add a new row to ${g.section}`}
                      onClick={(e) => { e.stopPropagation(); addRowToSection(g.section); }}
                    >
                      + Add row
                    </button>
                  </td>
                </tr>,
              ];
              if (isCollapsed) return out;
              let lastSub: string | null = null;
              for (let pos = 0; pos < g.rows.length; pos++) {
                const [item, i] = g.rows[pos];
                if (item.subcategory && item.subcategory !== lastSub) {
                  lastSub = item.subcategory;
                  out.push(
                    <tr className="subcat" key={'sub' + i}>
                      <td colSpan={nCols}>{item.subcategory}</td>
                    </tr>,
                  );
                }
                const qty = itemQty(item, counts);
                const sell = itemSell(item, s);
                const isCustom = item.section === 'Custom';
                out.push(
                  <tr key={i} data-row={item.row} onDragOver={(e) => e.preventDefault()} onDrop={() => reorderTo(i)}>
                    <td className="desc" style={cs('desc')}>
                      <div className="desc-with-del">
                        <span
                          className="drag-handle"
                          draggable
                          title="Drag to reorder — click to select the whole row"
                          onDragStart={(e) => { dragRow.current = i; startRowDrag(e); }}
                          onDragEnd={(e) => { dragRow.current = null; endRowDrag(e); }}
                          onClick={(e) => selectRow((e.currentTarget as HTMLElement).closest('tr')!)}
                        >
                          ⠿
                        </span>
                        {isCustom && (
                          <button
                            className="btn minus"
                            title="Remove this line"
                            onClick={() => update((dr) => dr.catalogue.splice(i, 1))}
                          >
                            −
                          </button>
                        )}
                        <input
                          value={item.description ?? ''}
                          onChange={(e) => update((dr) => (dr.catalogue[i].description = e.target.value))}
                        />
                      </div>
                    </td>
                    <td style={cs('part')}>
                      <input value={item.part_number ?? ''}
                        onChange={(e) => update((dr) => (dr.catalogue[i].part_number = e.target.value))} />
                    </td>
                    <td style={cs('brand')}>
                      <input value={item.manufacturer ?? ''}
                        onChange={(e) => update((dr) => (dr.catalogue[i].manufacturer = e.target.value))} />
                    </td>
                    <td style={cs('supplier')}>
                      <input value={item.supplier ?? ''}
                        onChange={(e) => update((dr) => (dr.catalogue[i].supplier = e.target.value))} />
                    </td>
                    <td className="num" style={cs('cost')}>
                      <NumInput
                        value={item.cost}
                        format={toDisplayNum}
                        parse={fromDisplayNum}
                        onValue={(n) => update((dr) => (dr.catalogue[i].cost = n))}
                        histKey={`cat:${item.row}:cost`}
                      />
                    </td>
                    <td className="num" style={cs('markup')}>
                      <NumInput
                        value={item.markup}
                        format={pctIn}
                        parse={pctOut}
                        integer
                        onValue={(n) => update((dr) => (dr.catalogue[i].markup = n))}
                        histKey={`cat:${item.row}:markup`}
                      />
                    </td>
                    <td className="num" style={cs('markupcont')}>
                      {item.cost ? `${Math.round(((item.markup ?? 0) + s.equipmentContingency) * 100)}%` : ''}
                    </td>
                    <td className="num" style={cs('sell')}>{item.cost ? fmtMoney(sell) : ''}</td>
                    <td className="num" style={cs('margin')}>{item.cost ? fmtPct(itemMargin(item, s)) : ''}</td>
                    <td className="num" style={cs('qty')}>{qty || ''}</td>
                    <td className="num" style={cs('sumsell')}>{qty ? fmtMoney(sell * qty) : ''}</td>
                    {state.room_types.map((rt) => (
                      <td key={rt.idx} className="num qtycell">
                        <NumInput
                          value={item.allocations[String(rt.idx)] ?? null}
                          format={numFmt}
                          parse={numParse}
                          className={counts[rt.idx] === 0 && item.allocations[String(rt.idx)] != null ? 'orphan-alloc' : ''}
                          onValue={(n) => setAllocNum(i, rt.idx, n)}
                          histKey={`cat:${item.row}:alloc:${rt.idx}`}
                        />
                      </td>
                    ))}
                  </tr>,
                );
              }
              return out;
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
