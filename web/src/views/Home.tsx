import { useEffect, useState } from 'react';
import { useProject } from '../state';
import { openProjectInNewWindow, reportBugOrFeature } from '../App';
import ScrollTopButton from '../components/ScrollTopButton';
import MatrixBackground from '../components/MatrixBackground';

interface Listing {
  path: string;
  name: string;
  updatedAt: string;
  inDefaultDir: boolean;
}

export default function Home() {
  const { openProject, newProject, theme, toggleTheme } = useProject();
  const [projects, setProjects] = useState<Listing[]>([]);
  const [defaultDir, setDefaultDir] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const load = () =>
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => {
        setProjects(d.projects);
        setDefaultDir(d.defaultDir);
      });

  useEffect(() => {
    load();
  }, []);

  const clearRecents = async () => {
    if (!window.confirm('Clear this list? No project files are deleted — a project reappears here next time you open or save it.')) return;
    await fetch('/api/recents/clear', { method: 'POST' });
    await load();
  };

  const removeRecent = async (p: string) => {
    await fetch('/api/recents/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p }),
    });
    await load();
  };

  const tryOpen = async (p: string) => {
    setError('');
    try {
      await openProject(p);
    } catch {
      setError(`Could not open: ${p}`);
    }
  };

  // Native file dialog → open the chosen project in this window.
  const browseAndOpen = async () => {
    const r = await fetch('/api/browse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'project' }),
    });
    const { path } = await r.json();
    if (path) tryOpen(path);
  };

  return (
    <>
      <MatrixBackground />
      <div className="home">
      <h1 className="home-title">
        <img src="/logo.png" alt="EasyCalc" className="home-logo" />
      </h1>
      <p className="subtitle">
        Projects are saved as files — by default in <code>{defaultDir}</code>. Copy or send a
        .qmproj file to share a project.
      </p>

      <div className="toolbar">
        <button className="btn" onClick={openProjectInNewWindow}>
          Open project from file… (new window)
        </button>
        <button className="btn secondary" onClick={reportBugOrFeature}>
          ✉ Report a bug or add a feature
        </button>
        <button className="btn secondary" onClick={toggleTheme}>
          {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
        </button>
      </div>

      <div className="panel">
        <h2>New project</h2>
        <div className="toolbar">
          <input
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ width: 280 }}
          />
          <button
            className="btn"
            disabled={!newName.trim()}
            onClick={() => newProject(newName.trim())}
          >
            Create
          </button>
        </div>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ marginBottom: 0 }}>Recent & saved projects</h2>
          <button className="btn secondary" onClick={clearRecents}>Clear recents</button>
        </div>
        {projects.length === 0 && <p className="subtitle" style={{ marginTop: 12 }}>No projects yet — create one above.</p>}
        {projects.length > 0 && <div style={{ height: 12 }} />}
        <table className="grid">
          <tbody>
            {projects.map((p) => (
              <tr key={p.path}>
                <td style={{ width: '30%' }}>
                  <b>{p.name}</b>
                </td>
                <td className="subtle-path">{p.path}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {new Date(p.updatedAt).toLocaleString('en-AU')}
                </td>
                <td style={{ width: 1, whiteSpace: 'nowrap' }}>
                  <button className="btn" onClick={() => tryOpen(p.path)}>
                    Open
                  </button>{' '}
                  <button
                    className="btn secondary"
                    title="Remove from this list (does not delete the file)"
                    onClick={() => removeRecent(p.path)}
                  >
                    Clear
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Open from another location</h2>
        <div className="toolbar">
          <button className="btn secondary" onClick={browseAndOpen}>
            📂 Browse for a project…
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            Pick a .qmproj file from anywhere on this computer — opens in this window.
          </span>
        </div>
        {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      </div>

      <p className="license-note">
        EasyCalc © 2026 The Roach House. All rights reserved. Unauthorised copying,
        modification, or distribution of this software is prohibited. See LICENSE.txt.
      </p>
      <ScrollTopButton />
      </div>
    </>
  );
}
