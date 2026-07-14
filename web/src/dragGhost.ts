import type { DragEvent } from 'react';

/**
 * Make the drag ghost the whole row rather than just the ⠿ handle, so a
 * translucent copy of the row follows the cursor while it's dragged. Also dims
 * the source row for the duration. Call from a row handle's onDragStart.
 */
export function startRowDrag(e: DragEvent) {
  const tr = (e.currentTarget as HTMLElement).closest('tr') as HTMLElement | null;
  if (!tr) return;
  e.dataTransfer.effectAllowed = 'move';
  // snapshot the row as the drag image, cursor sitting near the grab handle
  e.dataTransfer.setDragImage(tr, 24, tr.offsetHeight / 2);
  // dim the original AFTER the snapshot is taken (next tick), so the ghost
  // itself isn't dimmed.
  setTimeout(() => tr.classList.add('row-dragging'), 0);
}

/** Clear the drag state — call from the row handle's onDragEnd. */
export function endRowDrag(e: DragEvent) {
  (e.currentTarget as HTMLElement).closest('tr')?.classList.remove('row-dragging');
}
