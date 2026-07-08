import { useEffect, useState } from 'react';
import { isEmbedded, useProject } from '../state';
import { checkForUpdate, runUpdate, awaitUpdateAndReload, type UpdateInfo } from '../updateClient';

/**
 * On startup, asks whether a newer release exists on GitHub and, if so, shows a
 * one-line banner. "Update now" installs it and reloads the window onto the new
 * build; if the download can't start it opens the Releases page. Never shown in
 * the serverless web-file copy.
 */
export default function UpdateBanner() {
  const { path, dirty, saveNow } = useProject();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isEmbedded) return;
    checkForUpdate()
      .then((d) => { if (d.updateAvailable) setInfo(d); })
      .catch(() => {}); // offline — no nag
  }, []);

  if (!info || dismissed) return null;

  const update = async () => {
    setBusy(true);
    if (dirty && path) { try { await saveNow(); } catch { /* keep going */ } }
    if (!(await runUpdate())) {
      if (info.releaseUrl) window.open(info.releaseUrl, '_blank'); // manual fallback
      setBusy(false);
      return;
    }
    setNote('Installing… EasyCalc will reload automatically.');
    const reloaded = await awaitUpdateAndReload(info.current, path);
    if (!reloaded) setNote('Update installed — relaunch EasyCalc if it doesn’t reload.');
  };

  return (
    <div className="update-toast" role="status">
      <span>
        {note || `⬆️ EasyCalc v${info.latest} is available — you have v${info.current}.`}
      </span>
      {!note && (
        <button className="btn" onClick={update} disabled={busy}>
          {busy ? 'Updating…' : 'Update now'}
        </button>
      )}
      {!busy && (
        <button className="toast-x" title="Later" onClick={() => setDismissed(true)}>✕</button>
      )}
    </div>
  );
}
