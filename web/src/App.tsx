import { useEffect, useState } from 'react';
import { useProject, isEmbedded } from './state';
import { roomTypeCounts } from '@shared/engine';
import { registerSelectRow, publishSelectionSummary } from './gridSelection';
import SelectionSummary from './components/SelectionSummary';
import ScrollTopButton from './components/ScrollTopButton';
import UpdateDialog from './components/UpdateDialog';
import ClientLogo from './components/ClientLogo';
import Icon from './components/Icon';
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

/** Open the chosen project in a new window. The /open page drives the native
 *  dialog and navigates itself (or closes on cancel) — no blank placeholder. */
export function openProjectInNewWindow() {
  window.open(`${window.location.origin}/open`, '_blank', 'width=1500,height=950');
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
    // Double-click a column's right edge to snap it back to its default width.
    const onDbl = (e: MouseEvent) => {
      const th = thAt(e);
      if (th && nearEdge(th, e)) {
        th.style.width = '';
        th.style.minWidth = '';
        e.preventDefault();
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('dblclick', onDbl);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('dblclick', onDbl);
      document.body.style.cursor = '';
    };
  }, []);
}

/**
 * Crosshair highlight: the row and column of the focused grid cell light up,
 * so the active cell reads as the centre of a cross across a wide table.
 */
function useCrosshair() {
  useEffect(() => {
    const clear = () =>
      document.querySelectorAll('.cross-row, .cross-col')
        .forEach((e) => e.classList.remove('cross-row', 'cross-col'));
    const onFocusIn = (e: FocusEvent) => {
      clear();
      const td = (e.target as HTMLElement | null)?.closest?.('td') as HTMLTableCellElement | null;
      const table = td?.closest?.('table.grid') as HTMLTableElement | null;
      if (!td || !table || !td.parentElement) return;
      // no crosshair on the start-page recents list (row-hover highlight only)
      if (table.classList.contains('home-recents')) return;
      const col = td.cellIndex;
      for (const cell of (td.parentElement as HTMLTableRowElement).cells) cell.classList.add('cross-row');
      for (const tr of table.rows) tr.cells[col]?.classList.add('cross-col');
    };
    document.addEventListener('focusin', onFocusIn);
    return () => { document.removeEventListener('focusin', onFocusIn); clear(); };
  }, []);
}

/**
 * Spreadsheet-style grid interaction on every `table.grid`:
 *  - arrow keys move between input cells (Left/Right leave a cell at the text edge);
 *  - Shift+arrows / Shift+click / mouse-drag select a rectangular range;
 *  - Ctrl+C copies the selection to the OS clipboard as both TSV and a real
 *    HTML table (so pasting into Excel/Word/email lands as an actual table,
 *    not just tab-separated text), Ctrl+V pastes a block (a single copied
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
    const inputAt = (t: HTMLTableElement, r: number, c: number) => {
      const cell = cellAt(t, r, c);
      // skip columns hidden via the Filters menu (inline display:none) so arrow
      // nav / copy step over them instead of getting stuck
      if (!cell || cell.style.display === 'none') return null;
      return (cell.querySelector('input') as HTMLInputElement | null) ?? null;
    };

    const locate = (el: EventTarget | null): Pos | null => {
      const td = (el as HTMLElement | null)?.closest?.('td') as HTMLTableCellElement | null;
      const t = td?.closest?.('table.grid') as HTMLTableElement | null;
      if (!td || !t || !td.parentElement) return null;
      return { table: t, r: (td.parentElement as HTMLTableRowElement).rowIndex, c: td.cellIndex };
    };
    const curCell = () => locate(document.activeElement);

    const clearHi = () =>
      document.querySelectorAll('td.cell-sel').forEach((e) => e.classList.remove('cell-sel'));
    // A real (CSS-hidden) browser Selection matching the highlight, so the
    // right-click menu's native "Copy" is enabled instead of always greyed
    // out. Only for read-only tables (Procurement etc.) — a native Selection
    // can't see into an <input>'s value, so on editable grids it would make
    // "Copy" look enabled while actually copying nothing; there, Ctrl+C
    // (handled ourselves) stays the only real path and native Copy stays
    // honestly disabled.
    // Only ever clear a Selection we put here ourselves. Clearing
    // unconditionally wiped the caret the browser had just placed in a clicked
    // cell — mouseup fires after focus, so the field stayed focused but lost
    // its cursor and you couldn't type.
    let nativeRange = false;
    const dropNativeRange = () => {
      if (!nativeRange) return;
      window.getSelection()?.removeAllRanges();
      nativeRange = false;
    };
    const syncNativeSelection = () => {
      if (!selAnchor || !selHead || selAnchor.table !== selHead.table) return dropNativeRange();
      const t = selAnchor.table;
      if (t.querySelector('input')) return dropNativeRange();
      const r1 = Math.min(selAnchor.r, selHead.r), r2 = Math.max(selAnchor.r, selHead.r);
      const c1 = Math.min(selAnchor.c, selHead.c), c2 = Math.max(selAnchor.c, selHead.c);
      const startTd = cellAt(t, r1, c1), endTd = cellAt(t, r2, c2);
      if (!startTd || !endTd) return dropNativeRange();
      const range = document.createRange();
      range.setStartBefore(startTd);
      range.setEndAfter(endTd);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      nativeRange = true;
    };
    const clearSel = () => {
      selAnchor = null; selHead = null; clearHi(); syncNativeSelection(); summarize();
    };
    const drawHi = () => {
      // syncNativeSelection is NOT called here — setting a real Selection on
      // every mouseover while a drag is in progress fights the browser's own
      // native drag-selection state machine (each JS-set Range resets its
      // anchor, so the drag never gets past the first cell without an extra
      // click to "kick" it loose). It runs once, on mouseup, once the
      // selection has settled — see onMouseUp.
      clearHi();
      if (!selAnchor || !selHead || selAnchor.table !== selHead.table) return summarize();
      const t = selAnchor.table;
      const r1 = Math.min(selAnchor.r, selHead.r), r2 = Math.max(selAnchor.r, selHead.r);
      const c1 = Math.min(selAnchor.c, selHead.c), c2 = Math.max(selAnchor.c, selHead.c);
      if (r1 === r2 && c1 === c2) return summarize(); // single cell — rely on :focus outline
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) cellAt(t, r, c)?.classList.add('cell-sel');
      summarize();
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

    /** Count + total the current selection for the floating summary box.
     *  Editable money cells hold display-currency numbers and read-only ones
     *  render with a symbol already, so the total is in display currency
     *  either way — hence fmtMoneyDisplay, not fmtMoney, at the render end. */
    const summarize = () => {
      const R = rect();
      if (!R || !isMultiSel()) { publishSelectionSummary(null); return; }
      let cells = 0, numeric = 0, sum = 0, moneyCells = 0;
      for (let r = R.r1; r <= R.r2; r++) {
        for (let c = R.c1; c <= R.c2; c++) {
          const td = cellAt(R.table, r, c);
          if (!td || td.style.display === 'none') continue; // filter-hidden column
          cells++;
          const inp = inputAt(R.table, r, c);
          const text = (inp ? inp.value : td.textContent ?? '').trim();
          if (!text || !/\d/.test(text)) continue;
          // strip thousands separators and any currency/percent decoration
          const n = Number(text.replace(/[^\d.-]/g, ''));
          if (!Number.isFinite(n)) continue;
          numeric++;
          sum += n;
          if (inp ? inp.dataset.money === '1' : /[$€£¥]/.test(text)) moneyCells++;
        }
      }
      publishSelectionSummary({
        cells, numeric, sum,
        money: numeric > 0 && moneyCells === numeric,
      });
    };

    // A cell's copyable value: an input's live value where one exists, else
    // its plain text (read-only display tables — Procurement, summaries —
    // have no inputs at all, just <td>text</td>).
    const cellValue = (t: HTMLTableElement, r: number, c: number) => {
      const inp = inputAt(t, r, c);
      if (inp) return inp.value;
      const cell = cellAt(t, r, c);
      return cell && cell.style.display !== 'none' ? (cell.textContent ?? '').trim() : '';
    };

    /** 2D array of the current rectangle's cell values, or null. Skips pure
     *  header/divider rows (a row with no per-column input, in a table that
     *  otherwise has inputs) — but a fully read-only table (no inputs
     *  anywhere, e.g. Procurement) has no such rows to skip, every row counts. */
    const buildRows = (): string[][] | null => {
      const R = rect(); if (!R) return null;
      const readOnly = !R.table.querySelector('input');
      const out: string[][] = [];
      for (let r = R.r1; r <= R.r2; r++) {
        const cols: string[] = [];
        let rowHasInput = false;
        for (let c = R.c1; c <= R.c2; c++) {
          if (inputAt(R.table, r, c)) rowHasInput = true;
          cols.push(cellValue(R.table, r, c));
        }
        if (readOnly || rowHasInput) out.push(cols);
      }
      return out.length ? out : null;
    };
    const tsvOf = (rows: string[][]) => rows.map((r) => r.join('\t')).join('\n');
    const htmlEscape = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    // A real <table> alongside the TSV — Excel, Word, email clients and other
    // rich-text targets all prefer text/html when it's on the clipboard, so
    // this is what makes the paste land as an actual formatted table instead
    // of raw tab-separated text.
    const htmlOf = (rows: string[][]) =>
      `<table>${rows.map((r) => `<tr>${r.map((v) => `<td>${htmlEscape(v)}</td>`).join('')}</tr>`).join('')}</table>`;

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
      summarize(); // values changed under a live selection
    };

    const clearRange = () => {
      const R = rect(); if (!R) return;
      for (let r = R.r1; r <= R.r2; r++) for (let c = R.c1; c <= R.c2; c++) setCell(R.table, r, c, '');
      summarize(); // values changed under a live selection
    };

    const inCellTextSelection = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement && a.selectionStart !== a.selectionEnd;
    };
    // Ctrl/Cmd+C / X, handled at keydown rather than via the native 'copy'/'cut'
    // events: this grid's multi-cell selection is our own CSS highlight, not a
    // real browser Selection, and browsers only fire 'copy' when something is
    // natively selected — so the native event silently never fired for a
    // multi-cell (or even a plain unselected single-cell) copy. Writing
    // straight to the clipboard from the key handler works regardless, and
    // lets us hand over text/html (a real table) alongside the TSV.
    const onCopyOrCutKey = (e: KeyboardEvent, cut: boolean) => {
      if (inCellTextSelection() && !isMultiSel()) return; // let native copy handle partial text
      const rows = buildRows();
      if (!rows || !navigator.clipboard?.write) return; // nothing selected, or no Clipboard API — fall through to native
      e.preventDefault();
      const item = new ClipboardItem({
        'text/plain': new Blob([tsvOf(rows)], { type: 'text/plain' }),
        'text/html': new Blob([htmlOf(rows)], { type: 'text/html' }),
      });
      navigator.clipboard.write([item]).then(() => { if (cut) clearRange(); }).catch(() => {});
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
      // Right/middle click (e.g. to open the browser context menu over a
      // selection, for its own native Copy) must not disturb the selection —
      // only the primary button drives select/drag.
      if (e.button !== 0) return;
      // controls that act on the current selection (e.g. the cell-colour
      // buttons) must not wipe it when clicked.
      if ((e.target as HTMLElement).closest?.('.keep-selection')) return;
      const loc = locate(e.target);
      if (!loc) { clearSel(); return; }
      if (e.shiftKey) {
        e.preventDefault();
        if (!selAnchor || selAnchor.table !== loc.table) selAnchor = curCell() ?? loc;
        selHead = loc; drawHi();
      } else {
        dragAnchor = loc;
        if (inputAt(loc.table, loc.r, loc.c)) {
          clearSel(); // plain click on an editable cell focuses it normally
        } else {
          // read-only cell (nothing to focus) — register it as a single-cell
          // selection so it's immediately copyable, and drag can extend it.
          selAnchor = loc; selHead = loc; drawHi();
        }
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
    const onMouseUp = () => {
      // dragAnchor is only ever set when the mousedown that started this drag
      // landed on a grid cell (see onMouseDown) — gate on it so a completely
      // ordinary text-selection drag in a normal field (Dashboard's Project
      // Details/Branding inputs, etc.) doesn't get its just-made selection
      // wiped by syncNativeSelection's removeAllRanges() on release.
      if (dragAnchor) syncNativeSelection();
      dragAnchor = null;
    };

    const onKey = (e: KeyboardEvent) => {
      // Escape cancels the current cell selection (range + focused cell).
      if (e.key === 'Escape') {
        const active = document.activeElement;
        const inGrid = active instanceof HTMLInputElement && active.closest('table.grid');
        if (selAnchor || selHead || inGrid) {
          clearSel();
          if (inGrid) (active as HTMLElement).blur();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x')) {
        onCopyOrCutKey(e, e.key === 'x');
        return;
      }
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

    // clicking a row's ⠿ handle selects that whole row (all its input cells)
    registerSelectRow((tr) => {
      const t = tr.closest('table.grid') as HTMLTableElement | null;
      if (!t) return;
      const r = tr.rowIndex;
      let c1 = -1, c2 = -1;
      for (let c = 0; c < tr.cells.length; c++) {
        if (tr.cells[c].querySelector('input')) { if (c1 < 0) c1 = c; c2 = c; }
      }
      if (c1 < 0) return;
      selAnchor = { table: t, r, c: c1 };
      selHead = { table: t, r, c: c2 };
      drawHi();
      inputAt(t, r, c1)?.focus();
    });

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    return () => {
      registerSelectRow(null);
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('paste', onPaste);
      clearHi();
      publishSelectionSummary(null);
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
  const [orphanFilter, setOrphanFilter] = useState(false);
  useUiZoom();
  useColumnResizing();
  useSpreadsheetGrid();
  useCrosshair();

  // Orphan check: a value entered against a system type that no room uses shows
  // red in the grids; while any exists, a pulsing warning sits top-right.
  const counts = state ? roomTypeCounts(state) : [];
  const orphanTypes = state
    ? state.room_types.filter((rt) => (counts[rt.idx] ?? 0) === 0).map((rt) => rt.idx)
    : [];
  const orphanIn = (list: { allocations: Record<string, number> }[]) =>
    orphanTypes.length > 0 && list.some((it) => orphanTypes.some((idx) => it.allocations[String(idx)] != null));
  const orphanCat = !!state && orphanIn(state.catalogue);
  const orphanLm = !!state && orphanIn(state.labour_materials);
  const hasOrphanValue = orphanCat || orphanLm;

  // Drop the "affected only" filter once the errors are all resolved, so the
  // grids don't stay silently filtered with no banner to switch it off.
  useEffect(() => {
    if (!hasOrphanValue && orphanFilter) setOrphanFilter(false);
  }, [hasOrphanValue, orphanFilter]);

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

  const toggleOrphanFilter = () => setOrphanFilter((v) => !v);

  // Only warn on the page that actually holds the error values.
  const showOrphanBanner = (view === 'schedule' && orphanCat) || (view === 'lm' && orphanLm);

  return (
    <div className="layout">
      {showOrphanBanner && (
        <div className="orphan-warning" role="status">
          <span className="ow-msg">⚠ Missing type assignment</span>
          <button className="ow-btn" onClick={toggleOrphanFilter}>
            {orphanFilter ? 'Show all' : 'Show affected rows'}
          </button>
        </div>
      )}
      <div className="history-bar">
        {!isEmbedded && (
          <button title="Back to the start page" onClick={goToStartPage}>🏠 Start page</button>
        )}
        <button title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>↶ Undo</button>
        <button title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>↷ Redo</button>
      </div>
      <aside className="sidebar">
        {/* brand: client logo (display-only) beside the project title, on a backdrop
            that auto-contrasts with the logo's brightness */}
        <div className="brand">
          {clientLogo ? (
            <ClientLogo src={clientLogo} />
          ) : (
            <div className="brand-neutral">
              <span className="brand-placeholder">Insert client branding</span>
            </div>
          )}
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
            {/* --- saving --- */}
            <button onClick={() => saveNow()}>
              <Icon name="save" className="ico" />
              <span className="lbl">{isEmbedded ? 'Download changes' : 'Save now'}{dirty ? ' •' : ''}</span>
            </button>
            {!isEmbedded && (
              <button onClick={doSaveAs}>
                <Icon name="saveAs" className="ico" />
                <span className="lbl">Save As…</span>
              </button>
            )}
            {!isEmbedded && (
              <button onClick={saveWebFile}>
                <Icon name="web" className="ico" />
                <span className="lbl">Save as web file…</span>
              </button>
            )}
            {/* --- project --- */}
            {!isEmbedded && (
              <button
                onClick={handleReload}
                title="Reload this project from disk to pull in changes made by others"
              >
                <Icon name="refresh" className="ico" />
                <span className="lbl">Refresh changes{externalChange ? ' •' : ''}</span>
              </button>
            )}
            {!isEmbedded && (
              <button onClick={openProjectInNewWindow}>
                <Icon name="folder" className="ico" />
                <span className="lbl">Open project…</span>
              </button>
            )}
            {!isEmbedded && (
              <button onClick={() => { setView('dashboard'); closeProject(); }}>
                <Icon name="close" className="ico" />
                <span className="lbl">Close project</span>
              </button>
            )}
            {/* --- app --- */}
            <button onClick={toggleTheme}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="ico" />
              <span className="lbl">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
            {!isEmbedded && (
              <button onClick={() => setShowUpdates(true)}>
                <Icon name="update" className="ico" />
                <span className="lbl">Check for updates</span>
              </button>
            )}
            <button onClick={reportBugOrFeature}>
              <Icon name="mail" className="ico" />
              <span className="lbl">Report a bug / feature</span>
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
        {view === 'schedule' && <Schedule orphanFilter={orphanFilter} />}
        {view === 'lm' && <LabourMaterials orphanFilter={orphanFilter} />}
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
      <SelectionSummary />
      {showUpdates && <UpdateDialog onClose={() => setShowUpdates(false)} />}
    </div>
  );
}
