import { useEffect, useState } from 'react';
import { isEmbedded } from '../state';
import { checkForUpdate, runUpdate, type UpdateInfo } from '../updateClient';

/**
 * On startup, asks whether a newer release exists on GitHub and, if so, shows a
 * one-line banner. "Update now" downloads and runs the installer (which closes,
 * replaces, and relaunches the app); if that fails it opens the Releases page.
 * Never shown in the serverless web-file copy.
 */
export default function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
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
    if (await runUpdate()) return; // installer takes over
    if (info.releaseUrl) window.open(info.releaseUrl, '_blank'); // manual fallback
    setBusy(false);
  };

  return (
    <div className="update-toast" role="status">
      <span>⬆️ EasyCalc v{info.latest} is available — you have v{info.current}.</span>
      <button className="btn" onClick={update} disabled={busy}>
        {busy ? 'Updating…' : 'Update now'}
      </button>
      <button className="toast-x" title="Later" onClick={() => setDismissed(true)}>✕</button>
    </div>
  );
}
