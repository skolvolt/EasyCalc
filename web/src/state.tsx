import {
  createContext, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import type { ProjectState } from '@shared/types';
import { hydrateHistory, dumpHistory, setCurrentUser } from './cellHistory';

interface Store {
  state: ProjectState | null;
  path: string | null;
  saving: boolean;
  dirty: boolean;
  autosave: boolean;
  setAutosave: (on: boolean) => void;
  saveNow: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  update: (fn: (draft: ProjectState) => void) => void;
  openProject: (path: string) => Promise<void>;
  newProject: (name: string) => Promise<void>;
  saveAs: (path: string) => Promise<void>;
  closeProject: () => void;
  /** True when the project file on disk was changed by someone else. */
  externalChange: boolean;
  /** Re-read the project from disk, discarding in-memory state. */
  reloadFromDisk: () => Promise<void>;
  /** Hide the "changed elsewhere" notice without reloading. */
  dismissExternalChange: () => void;
}

const Ctx = createContext<Store>(null as any);
export const useProject = () => useContext(Ctx);

/** Embedded/standalone mode: project baked into the HTML, no server. */
const EMBEDDED: { state: ProjectState; name: string } | undefined = (window as any).__QM_EMBEDDED__;
export const isEmbedded = !!EMBEDDED;

/** Set before an intentional reload (e.g. applying an update) so the
 *  unsaved-changes close warning doesn't fire on that navigation. */
let unloadGuardBypassed = false;
export function bypassUnloadGuard(): void { unloadGuardBypassed = true; }

/** Attach the current cell-history snapshot so it persists with the project. */
const withHistory = (st: ProjectState): ProjectState => ({ ...st, cell_history: dumpHistory() });

/**
 * Load a project's saved history into the working store and drop it from the
 * live object, so the (potentially large) log never rides along in undo
 * snapshots — it is re-attached only at save time via withHistory().
 */
function loadHistoryAndStrip(st: ProjectState): ProjectState {
  hydrateHistory(st.cell_history);
  if (!st.cell_history) return st;
  const { cell_history, ...rest } = st;
  return rest;
}

function downloadProjectFile(state: ProjectState) {
  const name = (state.details.project_name || 'project').replace(/[^\w\- ]+/g, '') || 'project';
  const blob = new Blob([JSON.stringify(withHistory(state), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.qmproj`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const HISTORY_LIMIT = 60;
/** edits closer together than this collapse into one undo step */
const HISTORY_COALESCE_MS = 800;

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProjectState | null>(
    EMBEDDED ? loadHistoryAndStrip(EMBEDDED.state) : null,
  );
  const [path, setPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [fxRate, setFxRate] = useState(1);
  const [autosave, setAutosaveState] = useState(
    () => localStorage.getItem('qm-autosave') !== 'off',
  );
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('qm-theme') as 'dark') || 'light',
  );
  const [externalChange, setExternalChange] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  const stateRef = useRef<ProjectState | null>(null);
  const pathRef = useRef<string | null>(null);
  const autosaveRef = useRef(autosave);
  /** mtime of the last read/write WE performed — used to spot others' edits */
  const lastMtime = useRef<string | null>(null);
  const past = useRef<ProjectState[]>([]);
  const future = useRef<ProjectState[]>([]);
  const lastEdit = useRef(0);
  const dirtyRef = useRef(false);
  stateRef.current = state;
  pathRef.current = path;
  autosaveRef.current = autosave;
  dirtyRef.current = dirty;

  // Warn before the window closes with unsaved changes. Skipped when autosave
  // will persist them (server mode); always on for the serverless web copy,
  // which only saves via an explicit download.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unloadGuardBypassed) return;
      if (dirtyRef.current && (isEmbedded || !autosaveRef.current)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('qm-theme', theme);
  }, [theme]);

  // Windows/mac account name — attributed to cell-history edits.
  useEffect(() => {
    if (isEmbedded) return;
    fetch('/api/whoami')
      .then((r) => r.json())
      .then((d) => setCurrentUser(d.user || ''))
      .catch(() => {});
  }, []);

  // Live FX: refetch the AUD->currency rate whenever the project's currency
  // changes (and on open). Base currency needs no lookup.
  const currency = state?.details.currency || BASE_CURRENCY;
  useEffect(() => {
    let cancelled = false;
    if (currency === BASE_CURRENCY) {
      setFxRate(1);
      return;
    }
    if (isEmbedded) return; // no server to hit; keep last baked rate
    fetch(`/api/fx?base=${BASE_CURRENCY}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.rates && d.rates[currency]) setFxRate(d.rates[currency]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currency]);

  // keep the module-level formatter in sync (used by fmtMoney everywhere)
  setDisplayCurrency(currency, fxRate);

  // Support /?path=... so a project can be opened directly in a new window.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('path');
    if (p) {
      openProject(p).catch(() => {});
      window.history.replaceState(null, '', '/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function writeToDisk(st: ProjectState): Promise<void> {
    if (isEmbedded) {
      downloadProjectFile(st); // no server — hand back a file
      setDirty(false);
      return;
    }
    if (!pathRef.current) return;
    setSaving(true);
    const r = await fetch(`/api/project?path=${encodeURIComponent(pathRef.current)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withHistory(st)),
    });
    // remember our own write's mtime so the poll doesn't flag it as external
    try {
      const { mtime } = await r.json();
      if (mtime) lastMtime.current = mtime;
    } catch { /* ignore */ }
    setSaving(false);
    setDirty(false);
  }

  function schedulePersist(draft: ProjectState) {
    clearTimeout(timer.current);
    // Embedded mode can't autosave to disk — always mark dirty for manual save.
    if (autosaveRef.current && !isEmbedded) {
      timer.current = setTimeout(() => writeToDisk(draft), 600);
    } else {
      setDirty(true);
    }
  }

  const refreshHist = () =>
    setHist({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 });

  function update(fn: (draft: ProjectState) => void) {
    const prev = stateRef.current;
    if (!prev) return;
    const draft: ProjectState = structuredClone(prev);
    fn(draft);
    const now = Date.now();
    if (now - lastEdit.current > HISTORY_COALESCE_MS) {
      past.current.push(prev);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
      future.current = [];
    }
    lastEdit.current = now;
    stateRef.current = draft;
    setState(draft);
    refreshHist();
    schedulePersist(draft);
  }

  function undo() {
    const cur = stateRef.current;
    if (!cur || past.current.length === 0) return;
    const prev = past.current.pop()!;
    future.current.push(cur);
    stateRef.current = prev;
    setState(prev);
    lastEdit.current = 0; // next edit starts a fresh undo step
    refreshHist();
    schedulePersist(prev);
  }

  function redo() {
    const cur = stateRef.current;
    if (!cur || future.current.length === 0) return;
    const next = future.current.pop()!;
    past.current.push(cur);
    stateRef.current = next;
    setState(next);
    lastEdit.current = 0;
    refreshHist();
    schedulePersist(next);
  }

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) — but never steal undo from text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveNow() {
    clearTimeout(timer.current);
    if (stateRef.current) await writeToDisk(stateRef.current);
  }

  function setAutosave(on: boolean) {
    setAutosaveState(on);
    localStorage.setItem('qm-autosave', on ? 'on' : 'off');
    if (on && stateRef.current) {
      clearTimeout(timer.current);
      writeToDisk(stateRef.current);
    }
  }

  function resetHistory() {
    past.current = [];
    future.current = [];
    lastEdit.current = 0;
    refreshHist();
  }

  async function openProject(p: string) {
    const r = await fetch(`/api/project?path=${encodeURIComponent(p)}`);
    if (!r.ok) throw new Error('Could not open project');
    const { state: st, path: realPath, mtime } = await r.json();
    resetHistory();
    setDirty(false);
    setExternalChange(false);
    lastMtime.current = mtime ?? null;
    setState(loadHistoryAndStrip(st));
    setPath(realPath);
  }

  async function newProject(name: string) {
    const r = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const { path: p, state: st, mtime } = await r.json();
    resetHistory();
    setDirty(false);
    setExternalChange(false);
    lastMtime.current = mtime ?? null;
    setState(loadHistoryAndStrip(st));
    setPath(p);
  }

  async function saveAs(p: string) {
    if (!stateRef.current) return;
    const r = await fetch(`/api/project?path=${encodeURIComponent(p)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withHistory(stateRef.current)),
    });
    const { path: saved, mtime } = await r.json();
    lastMtime.current = mtime ?? null;
    setExternalChange(false);
    setPath(saved);
    setDirty(false);
  }

  /** Re-read the file from disk (used by the manual Refresh button and the
   *  "changed elsewhere" notice). Callers guard unsaved work. */
  async function reloadFromDisk() {
    const p = pathRef.current;
    if (!p) return;
    const r = await fetch(`/api/project?path=${encodeURIComponent(p)}`);
    if (!r.ok) return;
    const { state: st, mtime } = await r.json();
    resetHistory();
    setDirty(false);
    lastMtime.current = mtime ?? lastMtime.current;
    setExternalChange(false);
    setState(loadHistoryAndStrip(st));
  }

  // Poll every 30s for edits made by someone else sharing the same file.
  useEffect(() => {
    if (isEmbedded) return;
    const id = setInterval(async () => {
      const p = pathRef.current;
      if (!p || document.hidden) return;
      try {
        const r = await fetch(`/api/project/mtime?path=${encodeURIComponent(p)}`);
        if (!r.ok) return;
        const { mtime } = await r.json();
        if (mtime && lastMtime.current && mtime > lastMtime.current) setExternalChange(true);
      } catch { /* offline / transient — try again next tick */ }
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function closeProject() {
    clearTimeout(timer.current);
    resetHistory();
    setDirty(false);
    setState(null);
    setPath(null);
  }

  return (
    <Ctx.Provider
      value={{
        state, path, saving, dirty, autosave, setAutosave, saveNow,
        canUndo: hist.canUndo, canRedo: hist.canRedo, undo, redo,
        theme,
        toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
        update, openProject, newProject, saveAs, closeProject,
        externalChange, reloadFromDisk,
        dismissExternalChange: () => setExternalChange(false),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/**
 * Currency display. Stored values are in the base currency (AUD); a live rate
 * converts them for display. Kept at module scope so the many fmtMoney call
 * sites don't each need the rate threaded through — the provider updates it and
 * re-renders so every formatter reflects the change.
 */
export const BASE_CURRENCY = 'AUD';
let CUR = { code: BASE_CURRENCY, rate: 1 };
export function setDisplayCurrency(code: string, rate: number) {
  CUR = { code: code || BASE_CURRENCY, rate: rate || 1 };
}
export const currentCurrency = () => CUR.code;

export const fmtMoney = (n: number) =>
  (n * CUR.rate).toLocaleString('en-AU', {
    style: 'currency',
    currency: CUR.code,
    maximumFractionDigits: 2,
  });
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** base value -> number shown in an editable field (display currency) */
export const toDisplayNum = (n: number | null | undefined) =>
  n == null ? '' : String(Math.round(n * CUR.rate * 100) / 100);
/** editable field text (display currency) -> stored base value */
export const fromDisplayNum = (v: string): number | null =>
  v === '' ? null : (Number(v) || 0) / CUR.rate;

/** Percentage input helpers: display 25 for 0.25 */
export const pctIn = (frac: number | null | undefined) =>
  frac == null ? '' : String(Math.round(frac * 10000) / 100);
export const pctOut = (v: string) => (v === '' ? null : Number(v) / 100);

/** Plain number helpers (no currency conversion) — e.g. room quantities. */
export const numFmt = (n: number | null | undefined) => (n == null ? '' : String(n));
export const numParse = (v: string): number | null => {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};
