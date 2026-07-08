// Shared client for the GitHub update endpoints, used by both the startup
// banner and the manual "Check for updates" dialog so they can't drift.
import { bypassUnloadGuard } from './state';

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

/**
 * After kicking off the installer, poll /api/version until it differs from
 * `fromVersion` — i.e. the freshly-installed server has relaunched — then reload
 * this window onto the new build (reopening `path` if a project was open).
 * Returns false if the new version never appeared within the timeout.
 */
export async function awaitUpdateAndReload(fromVersion: string, path: string | null): Promise<boolean> {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const r = await fetch('/api/version', { cache: 'no-store' });
      const { version } = await r.json();
      if (version && version !== fromVersion) {
        bypassUnloadGuard(); // this reload is intentional — don't warn about unsaved work
        window.location.href = path ? `/?path=${encodeURIComponent(path)}` : '/';
        return true;
      }
    } catch {
      /* server is mid-restart — keep polling */
    }
  }
  return false;
}
