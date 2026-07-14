import { useEffect, useRef, useState } from 'react';
import { recordCell, cellHistory } from '../cellHistory';

/**
 * Numeric input that lets you actually type decimals.
 *
 * A plain controlled numeric field round-trips every keystroke through
 * Number()->string, which strips an in-progress decimal point or trailing
 * zero ("12." becomes "12", so "12.5" is impossible to type). This keeps a
 * local text buffer while the field is focused, so what you type is what you
 * see; the parsed value still flows to the model live for totals.
 *
 * Right-click opens a small value-history menu (see cellHistory) when a
 * `histKey` is supplied, so an earlier value can be recalled.
 */
export interface NumInputProps {
  value: number | null;
  onValue: (n: number | null) => void;
  format: (n: number | null | undefined) => string;
  parse: (s: string) => number | null;
  histKey?: string;
  className?: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  /** Whole numbers only — strips any decimal point as you type (percent fields). */
  integer?: boolean;
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function HistoryMenu({
  x, y, histKey, format, onPick, onClose,
}: {
  x: number; y: number; histKey: string;
  format: (n: number | null | undefined) => string;
  onPick: (v: number) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const list = cellHistory(histKey);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // keep the menu inside the viewport
  const left = Math.min(x, window.innerWidth - 190);
  const top = Math.min(y, window.innerHeight - 240);

  return (
    <div className="cell-hist-menu" ref={ref} style={{ left, top }}>
      <div className="cell-hist-title">Value history</div>
      {list.length === 0 && <div className="cell-hist-empty">No earlier values yet</div>}
      {list.map((e, i) => (
        <button key={i} className="cell-hist-item" onMouseDown={(ev) => ev.preventDefault()} onClick={() => onPick(e.value)}>
          <span className="v">{format(e.value)}</span>
          <span className="t">{timeAgo(e.ts)}{e.by ? ` · ${e.by}` : ''}</span>
        </button>
      ))}
    </div>
  );
}

/** A number-in-progress: digits with an optional sign / single decimal point.
 *  Anything else (letters, stray symbols) is flagged as an error. */
const NUMERIC_TEXT = /^-?\d*\.?\d*$/;

export default function NumInput({
  value, onValue, format, parse, histKey, className, placeholder, title, disabled, integer,
}: NumInputProps) {
  const [buf, setBuf] = useState<string | null>(null);
  const focusVal = useRef<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Non-numeric text was typed — show the cell in an error state and don't
  // push the garbage into the model (the last good value is kept until blur).
  const invalid = buf != null && buf.trim() !== '' && !NUMERIC_TEXT.test(buf);

  const onBlur = () => {
    // record the value the cell held before this edit, so it can be recalled
    if (histKey && focusVal.current !== value) recordCell(histKey, focusVal.current);
    setBuf(null);
  };

  const revertTo = (v: number) => {
    if (histKey) recordCell(histKey, value); // keep the current value recallable too
    onValue(v);
    setMenu(null);
  };

  return (
    <>
      <input
        className={(className ?? '') + (invalid ? ' num-error' : '')}
        placeholder={placeholder}
        title={
          invalid
            ? 'Enter a number — this looks like text'
            : title ?? (histKey ? 'Right-click to see this cell’s value history' : undefined)
        }
        disabled={disabled}
        inputMode="decimal"
        value={buf ?? format(value)}
        onChange={(e) => {
          // Integer fields: drop the decimal point and anything after it as typed,
          // so percentages stay whole numbers ("33.7" → "33").
          const t = integer
            ? e.target.value.replace(/\.[^]*$/, '').replace(/[^\d-]/g, '')
            : e.target.value;
          // Only hold a live text buffer while the user is actually typing here.
          // Programmatic changes (spreadsheet paste into an unfocused cell) skip
          // the buffer so the cell re-formats from the model instead of showing raw.
          if (document.activeElement === e.target) setBuf(t);
          // only apply genuinely numeric input; keep the last good value otherwise
          if (t.trim() === '' || NUMERIC_TEXT.test(t)) onValue(parse(t));
        }}
        onFocus={() => { focusVal.current = value; }}
        onBlur={onBlur}
        onContextMenu={
          histKey ? (e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); } : undefined
        }
      />
      {menu && histKey && (
        <HistoryMenu
          x={menu.x} y={menu.y} histKey={histKey} format={format}
          onPick={revertTo} onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
