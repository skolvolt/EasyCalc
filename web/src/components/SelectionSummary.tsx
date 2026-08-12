import { useEffect, useState } from 'react';
import { registerSelectionSummary, type CellSummary } from '../gridSelection';
import { fmtMoneyDisplay } from '../state';

/**
 * Spreadsheet-style selection readout — a small floating panel, bottom-right,
 * showing how many cells are selected and what their values add up to.
 *
 * Appears only for a real multi-cell selection, matching when the grid draws
 * its highlight (a single focused cell has nothing worth totalling).
 *
 * The total is always in the display currency: editable money cells hold
 * display-currency numbers, and read-only ones are already rendered with the
 * symbol — so it formats with fmtMoneyDisplay rather than fmtMoney, which
 * would apply the FX rate a second time.
 */
const fmtPlain = (n: number) =>
  n.toLocaleString('en-AU', { maximumFractionDigits: 2 });

export default function SelectionSummary() {
  const [s, setS] = useState<CellSummary | null>(null);

  useEffect(() => {
    registerSelectionSummary(setS);
    return () => registerSelectionSummary(null);
  }, []);

  if (!s || s.cells < 2) return null;

  return (
    <div className="sel-summary" role="status" aria-live="polite">
      <span>
        <b>{s.cells.toLocaleString('en-AU')}</b> cells
      </span>
      {s.numeric > 0 && (
        <span>
          Sum <b>{s.money ? fmtMoneyDisplay(s.sum) : fmtPlain(s.sum)}</b>
        </span>
      )}
    </div>
  );
}
