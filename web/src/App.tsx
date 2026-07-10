import { useEffect, useState } from 'react';
import { useProject, isEmbedded } from './state';
import ScrollTopButton from './components/ScrollTopButton';
import UpdateDialog from './components/UpdateDialog';
import Home from './views/Home';
import Dashboard from './views/Dashboard';
import Rooms from './views/Rooms';
import Schedule from './views/Schedule';
import LabourMaterials from './views/LabourMaterials';
import Invoices from './views/Invoices';
import Procurement from './views/Procurement';
import Notes from './views/Notes';

const VIEWS = [
  ['dashboard', 'Dashboard'],
  ['rooms', 'Rooms & Types'],
  ['schedule', 'Equipment Schedule'],
  ['lm', 'Labour & Materials'],
  ['invoices', 'Quotes & Invoices'],
  ['procurement', 'Procurement'],
  ['notes', 'Notes'],
] as const;

/** Open a native file dialog (on the server machine) and open the chosen project in a new window. */
export async function openProjectInNewWindow() {
  // Open the window synchronously on the click so it isn't blocked as a popup
  // (the native file dialog + fetch below would otherwise drop the user gesture).
  const w = window.open('about:blank', '_blank', 'width=1500,height=950');
  try {
    const r = await fetch('/api/browse-open', { method: 'POST' });
    const { path } = await r.json();
    if (path && w) w.location.href = `/?path=${encodeURIComponent(path)}`;
    else if (w) w.close(); // cancelled
  } catch {
    w?.close();
  }
}

export function reportBugOrFeature() {
  const subject = encodeURIComponent('EasyCalc — Bug report / feature request');
  const body = encodeURIComponent(
    'Type (bug / feature request):\n\nWhat happened / what would you like:\n\nSteps to reproduce (for bugs):\n\n',
  );
  window.location.href = `mailto:theroachhousestudio@gmail.com?subject=${subject}&body=${body}`;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function useUiZoom() {
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('qm-zoom')) || 1);
  useEffect(() => {
    (document.body.style as any).zoom = String(zoom);
    // Expose the factor so viewport-pinned chrome (the sidebar) can divide it
    // back out and stay exactly one window tall regardless of zoom.
    document.body.style.setProperty('--ui-zoom', String(zoom));
    localStorage.setItem('qm-zoom', String(zoom));
  }, [zoom]);
  useEffect(() => {
    const step = (dir: number) =>
      setZoom((z) => clamp(Math.round((z + dir * 0.1) * 100) / 100, 0.5, 2.5));
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      step(e.deltaY < 0 ? 1 : -1);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); step(1); }
      else if (e.key === '-') { e.preventDefault(); step(-1); }
      else if (e.key === '0') { e.preventDefault(); setZoom(1); }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return zoom;
}

/** Drag the right edge of any table header to resize that column. */
function useColumnResizing() {
  useEffect(() => {
    let target: HTMLElement | null = null;
    let startX = 0;
    let startW = 0;
    const EDGE = 7;
    const nearEdge = (th: HTMLElement, e: MouseEvent) =>
      th.getBoundingClientRect().right - e.clientX < EDGE;
    const thAt = (e: MouseEvent) =>
      (e.target as HTMLElement).closest?.('table.grid th') as HTMLElement | null;

    const onMove = (e: MouseEvent) => {
      if (target) {
        const w = Math.max(36, startW + (e.clientX - startX));
        target.style.width = `${w}px`;
        target.style.minWidth = `${w}px`;
        e.preventDefault();
        return;
      }
      const th = thAt(e);
      document.body.style.cursor = th && nearEdge(th, e) ? 'col-resize' : '';
    };
    const onDown = (e: MouseEvent) => {
      const th = thAt(e);
      if (th && nearEdge(th, e)) {
        target = th;
        startX = e.clientX;
        startW = th.getBoundingClientRect().width;
        e.preventDefault();
      }
    };
    const onUp = () => { target = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
  }, []);
}

/**
 * Spreadsheet-style grid interaction on every `table.grid`:
 *  - arrow keys move between input cells (Left/Right leave a cell at the text edge);
 *  - Shift+arrows / Shift+click / mouse-drag select a rectangular range;
 *  - Ctrl+C copies the selection as TSV, Ctrl+V pastes a block (a single copied
 *    value fills the whole selection, Excel-style).
 */
function useSpreadsheetGrid() {
  useEffect(() => {
    type Pos = { table: HTMLTableElement; r: number; c: number };
    // Range selection state. The *current* cell is always read live from
    // document.activeElement (reliable), so nothing depends on focus events.
    let selAnchor: Pos | null = null;
    let selHead: Pos | null = null;
    let dragAnchor: Pos | null = null;

    const cellAt = (t: HTMLTableElement, r: number, c: number) =>
      t.rows[r]?.cells[c] as HTMLTableCellElement | undefined;
    const inputAt = (t: HTMLTableElement, r: number, c: number) =>
      (cellAt(t, r, c)?.querySelector('input') as HTMLInputElement | null) ?? null;

    const locate = (el: EventTarget | null): Pos | null => {
      const td = (el as HTMLElement | null)?.closest?.('td') as HTMLTableCellElement | null;
      const t = td?.closest?.('table.grid') as HTMLTableElement | null;
      if (!td || !t || !td.parentElement) return null;
      return { table: t, r: (td.parentElement as HTMLTableRowElement).rowIndex, c: td.cellIndex };
    };
    const curCell = () => locate(document.activeElement);

    const clearHi = () =>
      document.querySelectorAll('td.cell-sel').forEach((e) => e.classList.remove('cell-sel'));
    const clearSel = () => { selAnchor = null; selHead = null; clearHi(); };
    const drawHi = () => {
      clearHi();
      if (!selAnchor || !selHead || selAnchor.table !== selHead.table) return;
      const t = selAnchor.table;
      const r1 = Math.min(selAnchor.r, selHead.r), r2 = Math.max(selAnchor.r, selHead.r);
      const c1 = Math.min(selAnchor.c, selHead.c), c2 = Math.max(selAnchor.c, selHead.c);
      if (r1 === r2 && c1 === c2) return; // single cell — rely on :focus outline
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) cellAt(t, r, c)?.classList.add('cell-sel');
    };

    // Next cell holding an input in a direction. Rows without an input at the
    // column (section / subcategory headers) are skipped, not treated as walls.
    const nextInput = (t: HTMLTableElement, from: { r: number; c: number }, dr: number, dc: number) => {
      let r = from.r, c = from.c;
      for (let i = 0; i < 2000; i++) {
        r += dr; c += dc;
        if (r < 0 || r >= t.rows.length) return null;
        const row = t.rows[r];
        if (!row) return null;
        if (dc !== 0 && (c < 0 || c >= row.cells.length)) return null; // ran off the row
        if (inputAt(t, r, c)) return { r, c };
      }
      return null;
    };

    const rect = () => {
      if (selAnchor && selHead && selAnchor.table === selHead.table) {
        const t = selAnchor.table;
        return {
          table: t,
          r1: Math.min(selAnchor.r, selHead.r), r2: Math.max(selAnchor.r, selHead.r),
          c1: Math.min(selAnchor.c, selHead.c), c2: Math.max(selAnchor.c, selHead.c),
        };
      }
      const cur = curCell();
      if (cur && inputAt(cur.table, cur.r, cur.c)) return { table: cur.table, r1: cur.r, r2: cur.r, c1: cur.c, c2: cur.c };
      return null;
    };

    const setValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const setCell = (t: HTMLTableElement, r: number, c: number, val: string) => {
      const inp = inputAt(t, r, c); if (!inp) return;
      setValueSetter.call(inp, val);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const isMultiSel = () =>
      !!(selAnchor && selHead && selAnchor.table === selHead.table
        && !(selAnchor.r === selHead.r && selAnchor.c === selHead.c));

    /** TSV of the current rectangle (skips pure header rows), or null. */
    const buildTSV = () => {
      const R = rect(); if (!R) return null;
      const lines: string[] = [];
      for (let r = R.r1; r <= R.r2; r++) {
        const cols: string[] = [];
        let rowHasInput = false;
        for (let c = R.c1; c <= R.c2; c++) { const inp = inputAt(R.table, r, c); if (inp) rowHasInput = true; cols.push(inp ? inp.value : ''); }
        if (rowHasInput) lines.push(cols.join('\t'));
      }
      return lines.length ? lines.join('\n') : null;
    };

    /** Distribute clipboard TSV over the selection: a single value fills the
     *  whole selection; a block maps onto consecutive data rows (skipping
     *  section/subcategory header rows). Works with data copied from Excel. */
    const distributePaste = (text: string) => {
      const R = rect(); if (!R) return;
      const grid = text.replace(/\r/g, '').split('\n').map((l) => l.split('\t'));
      while (grid.length > 1 && grid[grid.length - 1].every((x) => x === '')) grid.pop();
      const single = grid.length === 1 && grid[0].length === 1;
      if (single) {
        for (let r = R.r1; r <= R.r2; r++) for (let c = R.c1; c <= R.c2; c++) setCell(R.table, r, c, grid[0][0]);
      } else {
        const targetRows: number[] = [];
        for (let r = R.r1; r < R.table.rows.length && targetRows.length < grid.length; r++) {
          if (inputAt(R.table, r, R.c1)) targetRows.push(r);
        }
        for (let gr = 0; gr < grid.length && gr < targetRows.length; gr++) {
          for (let gc = 0; gc < grid[gr].length; gc++) setCell(R.table, targetRows[gr], R.c1 + gc, grid[gr][gc]);
        }
      }
    };

    const clearRange = () => {
      const R = rect(); if (!R) return;
      for (let r = R.r1; r <= R.r2; r++) for (let c = R.c1; c <= R.c2; c++) setCell(R.table, r, c, '');
    };

    // Native clipboard events — synchronous, no permission prompt, and they
    // correctly pre-empt the browser's default single-input paste.
    const inCellTextSelection = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement && a.selectionStart !== a.selectionEnd;
    };
    const onCopy = (e: ClipboardEvent) => {
      if (inCellTextSelection() && !isMultiSel()) return; // let native copy partial text
      const tsv = buildTSV(); if (tsv == null) return;
      e.clipboardData?.setData('text/plain', tsv);
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      if (inCellTextSelection() && !isMultiSel()) return;
      const tsv = buildTSV(); if (tsv == null) return;
      e.clipboardData?.setData('text/plain', tsv);
      e.preventDefault();
      clearRange();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!rect()) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      const gridData = /[\t\n]/.test(text.replace(/\r/g, '').replace(/\n+$/, ''));
      if (!gridData && !isMultiSel()) return; // single value into one cell → normal edit
      e.preventDefault();
      distributePaste(text);
    };

    const onMouseDown = (e: MouseEvent) => {
      const loc = locate(e.target);
      if (!loc) { clearSel(); return; }
      if (e.shiftKey) {
        e.preventDefault();
        if (!selAnchor || selAnchor.table !== loc.table) selAnchor = curCell() ?? loc;
        selHead = loc; drawHi();
      } else {
        dragAnchor = loc; clearSel(); // plain click focuses the input normally
      }
    };
    const onMouseOver = (e: MouseEvent) => {
      if (!dragAnchor || !(e.buttons & 1)) return;
      const loc = locate(e.target);
      if (!loc || loc.table !== dragAnchor.table) return;
      if (!selHead || loc.r !== selHead.r || loc.c !== selHead.c) {
        selAnchor = dragAnchor; selHead = loc;
        window.getSelection()?.removeAllRanges();
        drawHi();
      }
    };
    const onMouseUp = () => { dragAnchor = null; };

    const onKey = (e: KeyboardEvent) => {
      // Delete/Backspace clears every cell in a multi-cell selection at once.
      if ((e.key === 'Delete' || e.key === 'Backspace') && isMultiSel()) {
        e.preventDefault();
        clearRange();
        return;
      }
      const el = document.activeElement;
      if (!(el instanceof HTMLInputElement)) return;
      const cur = locate(el); if (!cur) return;
      const dirs: Record<string, [number, number]> = {
        ArrowDown: [1, 0], Enter: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      };
      const d = dirs[e.key]; if (!d) return;
      const [dr, dc] = d;
      const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
      const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
      if (dc === -1 && !atStart && !e.shiftKey) return; // still editing text within the cell
      if (dc === 1 && !atEnd && !e.shiftKey) return;

      if (e.shiftKey && e.key.startsWith('Arrow')) {
        if (!selAnchor || selAnchor.table !== cur.table) { selAnchor = cur; selHead = cur; }
        const from = selHead ?? cur;
        const nh = nextInput(cur.table, from, dr, dc);
        if (nh) {
          e.preventDefault();
          selHead = { table: cur.table, r: nh.r, c: nh.c };
          inputAt(cur.table, nh.r, nh.c)?.focus();
          drawHi();
        }
        return;
      }
      const nxt = nextInput(cur.table, cur, dr, dc);
      if (nxt) { e.preventDefault(); clearSel(); inputAt(cur.table, nxt.r, nxt.c)?.focus(); }
    };

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      clearHi();
    };
  }, []);
}

export default function App() {
  const {
    state, path, saving, dirty, autosave, setAutosave, saveNow,
    canUndo, canRedo, undo, redo, theme, toggleTheme, saveAs, closeProject,
    externalChange, reloadFromDisk, dismissExternalChange,
  } = useProject();
  const [view, setView] = useState<string>('dashboard');
  const [showUpdates, setShowUpdates] = useState(false);
  useUiZoom();
  useColumnResizing();
  useSpreadsheetGrid();

  if (!state) return <Home />;

  const doSaveAs = async () => {
    const r = await fetch('/api/browse-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggested: path ?? '' }),
    });
    const { path: chosen } = await r.json();
    if (chosen) saveAs(chosen);
  };

  const saveWebFile = async () => {
    if (!path) return;
    if (dirty) await saveNow();
    window.open(`/api/standalone?path=${encodeURIComponent(path)}`, '_blank');
  };

  const goToStartPage = () => {
    if (dirty && !autosave &&
        !window.confirm('You have unsaved changes. Leave to the start page anyway?')) return;
    setView('dashboard');
    closeProject();
  };

  const handleReload = async () => {
    if (dirty && !autosave &&
        !window.confirm('Reload the latest saved version? Your unsaved changes will be lost.')) return;
    await reloadFromDisk();
  };

  const clientLogo = state.details.client_logo;

  return (
    <div className="layout">
      <div className="history-bar">
        {!isEmbedded && (
          <button title="Back to the start page" onClick={goToStartPage}>🏠 Start page</button>
        )}
        <button title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>↶ Undo</button>
        <button title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>↷ Redo</button>
      </div>
      <aside className="sidebar">
        {/* brand: client logo (display-only) beside the project title, on a neutral backdrop */}
        <div className="brand">
          <div className="brand-neutral">
            {clientLogo ? (
              <img src={clientLogo} alt="Client logo" />
            ) : (
              <span className="brand-placeholder">Insert client branding</span>
            )}
          </div>
          <small className="brand-project">{state.details.project_name || 'Untitled project'}</small>
        </div>
        <nav>
          {VIEWS.map(([id, label]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-actions">
            {!isEmbedded && (
              <label className="autosave-row">
                <span>Autosave</span>
                <span className="switch">
                  <input type="checkbox" checked={autosave} onChange={(e) => setAutosave(e.target.checked)} />
                  <span className="slider" />
                </span>
              </label>
            )}
            <button onClick={() => saveNow()}>
              <span className="lbl">{isEmbedded ? 'Download changes' : 'Save now'}{dirty ? ' •' : ''}</span>
              <span className="ico">💾</span>
            </button>
            {!isEmbedded && (
              <button
                onClick={handleReload}
                title="Reload this project from disk to pull in changes made by others"
              >
                <span className="lbl">Refresh changes{externalChange ? ' •' : ''}</span>
                <span className="ico">🔄</span>
              </button>
            )}
            {!isEmbedded && (
              <button onClick={saveWebFile}>
                <span className="lbl">Save as web file…</span><span className="ico">🌐</span>
              </button>
            )}
            {!isEmbedded && (
              <button onClick={openProjectInNewWindow}>
                <span className="lbl">Open project…</span><span className="ico">📂</span>
              </button>
            )}
            {!isEmbedded && (
              <button onClick={doSaveAs}>
                <span className="lbl">Save As…</span><span className="ico">🗃️</span>
              </button>
            )}
            {!isEmbedded && (
              <button onClick={() => { setView('dashboard'); closeProject(); }}>
                <span className="lbl">Close project</span><span className="ico">✖️</span>
              </button>
            )}
            <button onClick={toggleTheme}>
              <span className="lbl">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              <span className="ico">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>
            {!isEmbedded && (
              <button onClick={() => setShowUpdates(true)}>
                <span className="lbl">Check for updates</span><span className="ico">⬆️</span>
              </button>
            )}
            <button onClick={reportBugOrFeature}>
              <span className="lbl">Report a bug / feature</span><span className="ico">✉️</span>
            </button>
          </div>
          <div className="save-state" title={path ?? ''}>
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : isEmbedded ? 'Web copy' : 'All changes saved'}
          </div>
          {/* the easyCalc logo always lives bottom-left */}
          <div className="app-logo-bottom">
            <img src="/logo.png" alt="EasyCalc" />
          </div>
        </div>
      </aside>
      <main className="main">
        {isEmbedded && (
          <div className="embedded-banner">
            📄 You're viewing a portable web copy of this project. Edits work live here; use
            <b> Download changes</b> to save an updated project file.
          </div>
        )}
        {view === 'dashboard' && <Dashboard />}
        {view === 'rooms' && <Rooms />}
        {view === 'schedule' && <Schedule />}
        {view === 'lm' && <LabourMaterials />}
        {view === 'invoices' && <Invoices />}
        {view === 'procurement' && <Procurement />}
        {view === 'notes' && <Notes />}
      </main>
      {externalChange && !isEmbedded && (
        <div className="update-toast" role="status">
          <span>🔄 This project was changed elsewhere.</span>
          <button className="btn" onClick={handleReload}>Reload</button>
          <button className="toast-x" title="Dismiss" onClick={dismissExternalChange}>✕</button>
        </div>
      )}
      <ScrollTopButton />
      {showUpdates && <UpdateDialog onClose={() => setShowUpdates(false)} />}
    </div>
  );
}
