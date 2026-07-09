// Client-side export of a list (equipment catalogue or labour & materials) as a
// JSON file. Importing is handled server-side (native dialog + parsing) so it can
// accept spreadsheets, .json exports and .qmproj projects alike.

/** Download `data` as a pretty-printed .json file. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Safe filename fragment from a project name. */
export function listFilename(prefix: string, projectName: string | null | undefined): string {
  const name = (projectName || 'list').replace(/[^\w\- ]+/g, '').trim() || 'list';
  return `EasyCalc-${prefix}-${name}.json`;
}
