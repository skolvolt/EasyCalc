/**
 * Bridge so a row's ⠿ handle (rendered in a view) can drive the spreadsheet
 * selection engine (which lives in App's useSpreadsheetGrid effect). The engine
 * registers an implementation; the handles call selectRow on a plain click.
 */
type SelectRowFn = (tr: HTMLTableRowElement) => void;

let impl: SelectRowFn | null = null;
export function registerSelectRow(fn: SelectRowFn | null) { impl = fn; }
export function selectRow(tr: HTMLTableRowElement) { impl?.(tr); }
