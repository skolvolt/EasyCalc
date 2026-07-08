import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useProject, fmtMoney, pctIn, pctOut, toDisplayNum, fromDisplayNum, numFmt, numParse, isEmbedded,
} from '../state';
import { settingsOf, itemSell, itemMargin, itemQty, roomTypeCounts } from '@shared/engine';
import type { CatalogueItem } from '@shared/types';
import NumInput from '../components/NumInput';

interface PriceMatch {
  itemRow: number;
  matchedOn: 'part_number' | 'description';
  matchedText: string;
  sheet: string;
  currentCost: number | null;
  newPrice: number;
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
                              {m.matchedText} <em>({m.matchedOn.replace('_', ' ')}, {m.sheet})</em>:{' '}
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

export default function Schedule() {
  const { state, update } = useProject();
  const [section, setSection] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [showEmpty, setShowEmpty] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [scrollW, setScrollW] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importing, setImporting] = useState(false);
  if (!state) return null;
  const s = settingsOf(state);
  const counts = roomTypeCounts(state);
  const nCols = 11 + state.room_types.length;

  const sections = useMemo(
    () => ['All', ...new Set(state.catalogue.map((i) => i.section).filter(Boolean) as string[])],
    [state.catalogue],
  );

  const q = search.toLowerCase();
  const visible = state.catalogue
    .map((item, i) => [item, i] as [CatalogueItem, number])
    .filter(([item]) => {
      if (section !== 'All' && item.section !== section) return false;
      if (!showEmpty && itemQty(item, counts) === 0) return false;
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

  // margin entered as a fraction (pctOut already divided by 100)
  const setMarginFrac = (i: number, frac: number | null) =>
    update((dr) => {
      const item = dr.catalogue[i];
      const margin = frac ?? 0;
      if (margin >= 1 || !item.cost) return;
      const sell = margin === 0 ? item.cost : item.cost / (1 - margin);
      item.markup = sell / item.cost - 1 - s.equipmentContingency;
    });

  // sell already converted to base currency by NumInput's parse -> back-solve markup
  const setSellBase = (i: number, sellBase: number | null) =>
    update((dr) => {
      const item = dr.catalogue[i];
      if (!item.cost) return;
      const base = sellBase ?? item.cost;
      item.markup = base / item.cost - 1 - s.equipmentContingency;
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

  // Import an equipment list from a spreadsheet (columns matched by header keyword).
  const importList = async () => {
    const r = await fetch('/api/browse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'pricelist' }),
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
      if (!window.confirm(`Import ${data.items.length} items (matched: ${data.mapped.join(', ')})?\nThis replaces the current equipment list.`)) return;
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
        {state.catalogue.length} catalogue items. Mark-up, sell and margin are all editable and
        back-solve each other. First four columns stay put while scrolling right.
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
          <button className="btn secondary" onClick={() => addCustomItems(1)}>+ Add custom item</button>
          <button className="btn secondary" onClick={() => addCustomItems(5)} title="Add 5 custom items">+5</button>
          <button className="btn secondary" onClick={() => addCustomItems(10)} title="Add 10 custom items">+10</button>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{visible.length} rows</span>
        </div>
      </div>

      {/* synced horizontal scrollbar above the table */}
      <div className="scroll-top" ref={topRef} onScroll={syncFromTop}>
        <div style={{ width: scrollW }} />
      </div>

      <div className="panel scroll-x freeze-scroll" ref={bottomRef} onScroll={syncFromBottom} style={{ paddingTop: 0 }}>
        <table className="grid nowrap freeze">
          <thead>
            <tr>
              <th>Description</th>
              <th>Part #</th>
              <th>Brand</th>
              <th>Supplier</th>
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
            {grouped.map((g) => {
              const isCollapsed = collapsed.has(g.section);
              const out: React.ReactNode[] = [
                <tr className="sec-head" key={'sec' + g.section} onClick={() => toggle(g.section)}>
                  <td colSpan={nCols}>
                    <span className="caret">{isCollapsed ? '▸' : '▾'}</span>
                    {g.section} <span style={{ opacity: 0.8, fontWeight: 400 }}>({g.rows.length})</span>
                  </td>
                </tr>,
              ];
              if (isCollapsed) return out;
              let lastSub: string | null = null;
              for (const [item, i] of g.rows) {
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
                  <tr key={i}>
                    <td className="desc">
                      {isCustom ? (
                        <div className="desc-with-del">
                          <button
                            className="btn minus"
                            title="Remove this custom line"
                            onClick={() => update((dr) => dr.catalogue.splice(i, 1))}
                          >
                            −
                          </button>
                          <input
                            value={item.description ?? ''}
                            onChange={(e) => update((dr) => (dr.catalogue[i].description = e.target.value))}
                          />
                        </div>
                      ) : (
                        <input
                          value={item.description ?? ''}
                          onChange={(e) => update((dr) => (dr.catalogue[i].description = e.target.value))}
                        />
                      )}
                    </td>
                    <td>
                      {isCustom ? (
                        <input value={item.part_number ?? ''}
                          onChange={(e) => update((dr) => (dr.catalogue[i].part_number = e.target.value))} />
                      ) : item.part_number}
                    </td>
                    <td>
                      {isCustom ? (
                        <input value={item.manufacturer ?? ''}
                          onChange={(e) => update((dr) => (dr.catalogue[i].manufacturer = e.target.value))} />
                      ) : item.manufacturer}
                    </td>
                    <td>
                      {isCustom ? (
                        <input value={item.supplier ?? ''}
                          onChange={(e) => update((dr) => (dr.catalogue[i].supplier = e.target.value))} />
                      ) : item.supplier}
                    </td>
                    <td className="num">
                      <NumInput
                        value={item.cost}
                        format={toDisplayNum}
                        parse={fromDisplayNum}
                        onValue={(n) => update((dr) => (dr.catalogue[i].cost = n))}
                        histKey={`cat:${item.row}:cost`}
                      />
                    </td>
                    <td className="num">
                      <NumInput
                        value={item.markup}
                        format={pctIn}
                        parse={pctOut}
                        onValue={(n) => update((dr) => (dr.catalogue[i].markup = n))}
                        histKey={`cat:${item.row}:markup`}
                      />
                    </td>
                    <td className="num">
                      {item.cost ? (
                        <NumInput
                          value={sell}
                          format={toDisplayNum}
                          parse={fromDisplayNum}
                          onValue={(n) => setSellBase(i, n)}
                          histKey={`cat:${item.row}:sell`}
                        />
                      ) : ''}
                    </td>
                    <td className="num">
                      {item.cost ? (
                        <NumInput
                          value={itemMargin(item, s)}
                          format={pctIn}
                          parse={pctOut}
                          onValue={(n) => setMarginFrac(i, n)}
                          histKey={`cat:${item.row}:margin`}
                        />
                      ) : ''}
                    </td>
                    <td className="num">{qty || ''}</td>
                    <td className="num">{qty ? fmtMoney(sell * qty) : ''}</td>
                    {state.room_types.map((rt) => (
                      <td key={rt.idx} className="num qtycell">
                        <NumInput
                          value={item.allocations[String(rt.idx)] ?? null}
                          format={numFmt}
                          parse={numParse}
                          onValue={(n) => setAllocNum(i, rt.idx, n)}
                          histKey={`cat:${item.row}:alloc:${rt.idx}`}
                        />
                      </td>
                    ))}
                    <td></td>
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
