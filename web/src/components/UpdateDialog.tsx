import { useEffect, useState } from 'react';
import { useProject } from '../state';
import { checkForUpdate, runUpdate, awaitUpdateAndReload, type UpdateInfo } from '../updateClient';

/**
 * Manual "Check for updates" dialog. Polls GitHub fresh (bypassing the hourly
 * cache) and shows installed vs latest version, with an Update button when a
 * newer release is available.
 */
export default function UpdateDialog({ onClose }: { onClose: () => void }) {
  const { path, dirty, saveNow } = useProject();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'' | 'installing' | 'timeout'>('');

  const check = () => {
    setLoading(true);
    setError(false);
    checkForUpdate(true)
      .then(setInfo)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(check, []);

  // Esc closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = async () => {
    if (!info) return;
    setBusy(true);
    // preserve unsaved work across the update (server mode)
    if (dirty && path) { try { await saveNow(); } catch { /* keep going */ } }
    if (!(await runUpdate())) {
      if (info.releaseUrl) window.open(info.releaseUrl, '_blank'); // manual fallback
      setBusy(false);
      return;
    }
    // installer is running; wait for the new build to come back, then reload.
    setPhase('installing');
    const reloaded = await awaitUpdateAndReload(info.current, path);
    if (!reloaded) setPhase('timeout'); // page will otherwise have reloaded
  };

  // GitHub unreachable (offline, or repo not configured yet) → no latest version.
  const unreachable = !loading && (error || !info?.latest);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Check for updates</h3>
          <button className="toast-x" title="Close" onClick={onClose}>✕</button>
        </div>

        {phase === 'installing' ? (
          <p className="modal-status">Installing update… EasyCalc will reload automatically when it’s ready.</p>
        ) : phase === 'timeout' ? (
          <p className="modal-status bad">Update installed. If EasyCalc doesn’t reload shortly, relaunch it from your shortcut.</p>
        ) : loading ? (
          <p className="modal-status">Checking GitHub…</p>
        ) : (
          <>
            <div className="ver-row"><span>Installed version</span><b>v{info?.current ?? '—'}</b></div>
            <div className="ver-row">
              <span>Latest version</span>
              <b>{unreachable ? '—' : `v${info!.latest}`}</b>
            </div>

            {unreachable ? (
              <p className="modal-status bad">Couldn’t reach GitHub. Check your connection and try again.</p>
            ) : info!.updateAvailable ? (
              <p className="modal-status">A newer version is available.</p>
            ) : (
              <p className="modal-status good">You’re on the latest version. 🎉</p>
            )}

            <div className="modal-actions">
              <button className="btn secondary" onClick={check} disabled={busy}>Check again</button>
              {info?.updateAvailable && (
                <button className="btn" onClick={update} disabled={busy}>
                  {busy ? 'Updating…' : 'Update now'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
