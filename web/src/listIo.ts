// Client-side import/export of a list (equipment catalogue or labour & materials)
// as a JSON file. Import also accepts a whole .qmproj project and pulls the list
// field out of it, so you can load a list straight from a previous project.

/** Download `data` as a pretty-printed .json file. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Prompt for a .json/.qmproj file and hand back the list. If the file is a bare
 * array it's used directly; if it's a project object, `field` is extracted from it.
 */
export function pickList(field: string, onList: (arr: any[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.qmproj,application/json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const list = Array.isArray(data) ? data : data?.[field];
        if (!Array.isArray(list)) throw new Error('no list');
        onList(list);
      } catch {
        window.alert('That file isn’t a valid exported list or project.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

/** Safe filename fragment from a project name. */
export function listFilename(prefix: string, projectName: string | null | undefined): string {
  const name = (projectName || 'list').replace(/[^\w\- ]+/g, '').trim() || 'list';
  return `EasyCalc-${prefix}-${name}.json`;
}
