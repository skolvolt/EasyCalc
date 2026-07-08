// Per-cell value history.
//
// Records the sequence of values a numeric cell has held so the user can
// right-click and revert to an earlier entry. Keyed by a stable cell id
// (e.g. "cat:12:cost") rather than a row index, so it survives re-sorting and
// re-rendering.
//
// The working store is this in-memory Map, but it is hydrated from the project
// file on open and dumped back on save (see state.tsx), so history persists
// across sessions and accumulates for the life of the project.

export interface CellEntry {
  value: number;
  ts: number;
  /** Windows account that made the change (best-effort; see /api/whoami). */
  by?: string;
}

const store = new Map<string, CellEntry[]>();
const CAP = 50;

/** Current user's Windows account name, fetched once from the server. */
let currentUser = '';
export function setCurrentUser(name: string): void {
  currentUser = name || '';
}

/** Push a value the cell previously held. Consecutive duplicates are ignored. */
export function recordCell(key: string | undefined, value: number | null | undefined): void {
  if (!key || value == null || Number.isNaN(value)) return;
  const list = store.get(key) ?? [];
  if (list.length && list[0].value === value) return;
  list.unshift({ value, ts: Date.now(), by: currentUser || undefined });
  if (list.length > CAP) list.length = CAP;
  store.set(key, list);
}

/** Most-recent-first list of earlier values for a cell. */
export function cellHistory(key: string | undefined): CellEntry[] {
  return key ? store.get(key) ?? [] : [];
}

/**
 * Replace the working store with a project's saved history. Clears first so
 * switching projects in one window doesn't leak one project's history onto
 * another's identically-keyed cells.
 */
export function hydrateHistory(saved: Record<string, CellEntry[]> | undefined | null): void {
  store.clear();
  if (!saved) return;
  for (const [key, list] of Object.entries(saved)) {
    if (Array.isArray(list) && list.length) store.set(key, list.slice(0, CAP));
  }
}

/** Snapshot the working store for persistence in the project file. */
export function dumpHistory(): Record<string, CellEntry[]> {
  return Object.fromEntries(store);
}
