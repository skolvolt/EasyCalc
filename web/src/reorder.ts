/**
 * Move the item at `from` so it lands exactly on the row released over
 * (`targetI`), matching the drag direction — dragging down lands the row after
 * the removal shift so it sits on the drop row, dragging up lands it before.
 * Mutates `arr` in place. No-op when the indices are equal or out of range.
 */
export function moveByDrop<T>(arr: T[], from: number, targetI: number): void {
  if (from === targetI || from < 0 || from >= arr.length) return;
  const [moved] = arr.splice(from, 1);
  arr.splice(targetI, 0, moved);
}
