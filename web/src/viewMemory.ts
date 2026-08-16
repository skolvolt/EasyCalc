import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * View state that survives navigating away and back.
 *
 * Only one view is mounted at a time (`{view === 'invoices' && <Invoices />}`
 * in App), so plain useState is thrown away the moment you switch tabs and the
 * page reopens on its defaults. This keeps the last value in a module-level
 * store, keyed by view, so a page comes back the way it was left — the room
 * you had selected, the tab you were on, the columns you'd hidden.
 *
 * Use it for *where you were*, not for transient UI — a half-open menu, an
 * in-flight import or an armed "are you sure?" confirmation should all start
 * clean, so those stay on useState.
 *
 * Held in memory only, and cleared when a different project is opened: a
 * remembered room or section from another project means nothing. Anything that
 * should outlive the app belongs in the project file instead.
 */
const store = new Map<string, unknown>();

/** Forget every remembered view position (called when the project changes). */
export function resetViewMemory() {
  store.clear();
}

/** useState, but the value is remembered across unmount/remount of the view. */
export function useSticky<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setV((prev) => {
        const val = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        store.set(key, val);
        return val;
      });
    },
    [key],
  );

  return [v, set];
}
