// Shared client for the GitHub update endpoints, used by both the startup
// banner and the manual "Check for updates" dialog so they can't drift.

export interface UpdateInfo {
  current: string;
  latest?: string;        // absent if GitHub couldn't be reached
  updateAvailable: boolean;
  releaseUrl?: string;
}

/** Ask the server to compare local vs latest GitHub release.
 *  `force` bypasses the server's hourly cache (for manual checks). */
export async function checkForUpdate(force = false): Promise<UpdateInfo> {
  const r = await fetch(`/api/app-update${force ? '?refresh=1' : ''}`);
  return r.json();
}

/** Start the installer download+run. Returns false if it couldn't start, so
 *  the caller can fall back to opening the Releases page. */
export async function runUpdate(): Promise<boolean> {
  try {
    const r = await fetch('/api/app-update/run', { method: 'POST' });
    return r.ok;
  } catch {
    return false;
  }
}
