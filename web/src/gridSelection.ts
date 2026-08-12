/**
 * Bridge so a row's ⠿ handle (rendered in a view) can drive the spreadsheet
 * selection engine (which lives in App's useSpreadsheetGrid effect). The engine
 * registers an implementation; the handles call selectRow on a plain click.
 */
type SelectRowFn = (tr: HTMLTableRowElement) => void;

let impl: SelectRowFn | null = null;
export function registerSelectRow(fn: SelectRowFn | null) { impl = fn; }
export function selectRow(tr: HTMLTableRowElement) { impl?.(tr); }

/**
 * The other direction: the engine publishes what the current selection adds up
 * to, and the floating summary box (a React component) renders it. Null means
 * "nothing worth showing" — no selection, or only a single cell.
 */
export type CellSummary = {
  /** cells in the selected rectangle (skipping filter-hidden columns) */
  cells: number;
  /** how many of those held a number */
  numeric: number;
  /** total of the numeric ones, in display currency when `money` is true */
  sum: number;
  /** every numeric cell was a money cell, so format the total as currency */
  money: boolean;
};
type SummarySink = (s: CellSummary | null) => void;

let sink: SummarySink | null = null;
export function registerSelectionSummary(fn: SummarySink | null) { sink = fn; }
export function publishSelectionSummary(s: CellSummary | null) { sink?.(s); }
