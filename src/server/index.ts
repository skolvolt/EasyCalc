import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { join, dirname, basename } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { userInfo, tmpdir } from 'node:os';
import {
  listProjects, readProject, writeProject, createProject, clearRecents, dismissRecent, touchRecent,
  readSettings, writeSettings, projectMtime, writeDefaultCatalogue, writeDefaultLm, PROJECTS_DIR, type AppSettings,
} from './store';
import { checkPricelist, type PricelistItemQuery } from './pricelist';
import { isNewer } from './version';
import { importCatalogue } from './catalogueImport';
import { importLm } from './lmImport';
import { renderDocument, type DocKind } from './invoiceHtml';
import { renderWorkbook } from './invoiceXlsx';
import { htmlToPdf } from './pdf';
import type { ProjectState, CatalogueItem, LmItem } from '../shared/types';

const dir = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.QM_WEB_DIST || join(dir, '../../web/dist');

const app = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 });

app.get('/api/projects', async () => listProjects());

app.post('/api/projects', async (req) => {
  const { name } = (req.body ?? {}) as { name?: string };
  const created = createProject(name || 'New Project');
  return { ...created, mtime: projectMtime(created.path) };
});

app.post('/api/recents/clear', async () => {
  clearRecents();
  return { ok: true };
});

// Remove a single entry from the home list (leaves the file on disk).
app.post('/api/recents/remove', async (req, reply) => {
  const { path } = (req.body ?? {}) as { path?: string };
  if (!path) return reply.code(400).send({ error: 'path required' });
  dismissRecent(path);
  return { ok: true };
});

// Windows (or macOS) account name — attributed to cell-history edits.
app.get('/api/whoami', async () => {
  try {
    return { user: userInfo().username || '' };
  } catch {
    return { user: '' };
  }
});

// A .json list export or a .qmproj project → pull the list array out of it.
const isJsonList = (f: string) => /\.(json|qmproj)$/i.test(f);
function listFromJsonFile(file: string, field: 'catalogue' | 'labour_materials'): unknown[] {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const list = Array.isArray(data) ? data : (data as any)?.[field];
  if (!Array.isArray(list)) throw new Error(`No ${field.replace('_', ' & ')} list found in that file.`);
  return list;
}

// Import an equipment list — from a spreadsheet (column-mapped) OR a .json
// export / .qmproj project (its catalogue).
app.post('/api/catalogue/import', async (req, reply) => {
  const { file } = (req.body ?? {}) as { file?: string };
  if (!file) return reply.code(400).send({ error: 'file required' });
  try {
    return isJsonList(file)
      ? { items: listFromJsonFile(file, 'catalogue'), mapped: [] }
      : importCatalogue(file);
  } catch (e: any) {
    return reply.code(400).send({ error: e.message });
  }
});

// Import a Labour & Materials list — from a spreadsheet OR a .json export /
// .qmproj project (its labour_materials).
app.post('/api/lm/import', async (req, reply) => {
  const { file } = (req.body ?? {}) as { file?: string };
  if (!file) return reply.code(400).send({ error: 'file required' });
  try {
    return isJsonList(file)
      ? { items: listFromJsonFile(file, 'labour_materials'), mapped: [] }
      : importLm(file);
  } catch (e: any) {
    return reply.code(400).send({ error: e.message });
  }
});

// Save the current equipment list as the default applied to new projects.
app.post('/api/catalogue/set-default', async (req, reply) => {
  const { catalogue } = (req.body ?? {}) as { catalogue?: CatalogueItem[] };
  if (!Array.isArray(catalogue)) return reply.code(400).send({ error: 'catalogue required' });
  writeDefaultCatalogue(catalogue);
  return { ok: true, count: catalogue.length };
});

// Save the current Labour & Materials list as the default applied to new projects.
app.post('/api/lm/set-default', async (req, reply) => {
  const { labour_materials } = (req.body ?? {}) as { labour_materials?: LmItem[] };
  if (!Array.isArray(labour_materials)) return reply.code(400).send({ error: 'labour_materials required' });
  writeDefaultLm(labour_materials);
  return { ok: true, count: labour_materials.length };
});

// App-level settings (default PDF letterhead logo)
app.get('/api/settings', async () => readSettings());
app.put('/api/settings', async (req) => writeSettings((req.body ?? {}) as AppSettings));

app.get('/api/project', async (req, reply) => {
  const { path } = req.query as { path?: string };
  if (!path) return reply.code(400).send({ error: 'path required' });
  try {
    const state = readProject(path);
    touchRecent(path);
    return { path, state, mtime: projectMtime(path) };
  } catch {
    return reply.code(404).send({ error: 'could not read project file' });
  }
});

// Lightweight change-check: just the file's modification time.
app.get('/api/project/mtime', async (req, reply) => {
  const { path } = req.query as { path?: string };
  if (!path) return reply.code(400).send({ error: 'path required' });
  return { mtime: projectMtime(path) };
});

// Save (autosave) — also used by Save As with a new path.
app.put('/api/project', async (req, reply) => {
  const { path } = req.query as { path?: string };
  if (!path) return reply.code(400).send({ error: 'path required' });
  try {
    const saved = writeProject(path, req.body as ProjectState);
    return { ok: true, path: saved, mtime: projectMtime(saved) };
  } catch (e: any) {
    return reply.code(500).send({ error: e.message });
  }
});

// PowerShell prefix that builds $o = an owner bound to the current foreground
// window (EasyCalc), so the dialog opens *in front* of it. A hidden background
// process can't otherwise pull its dialog above the active window; owning the
// dialog to that window guarantees the dialog sits over it.
const PS_FG_OWNER =
  `Add-Type -AssemblyName System.Windows.Forms; ` +
  `Add-Type 'using System;using System.Windows.Forms;using System.Runtime.InteropServices;public class QmFg:IWin32Window{[DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();public IntPtr Handle{get;set;}public QmFg(){this.Handle=GetForegroundWindow();}}' -ReferencedAssemblies System.Windows.Forms; ` +
  `$o = New-Object QmFg; `;

// Native "Open File" dialog on the machine the server runs on.
// kind=project (.qmproj) | pricelist (.xlsx/.csv) | list (spreadsheet or json/qmproj)
async function nativeOpenDialog(kind: 'project' | 'pricelist' | 'list'): Promise<string | null> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const winFilter =
    kind === 'pricelist'
      ? "Pricelists (*.xlsx;*.xls;*.csv)|*.xlsx;*.xls;*.csv|All files (*.*)|*.*"
      : kind === 'list'
        ? "Lists (*.xlsx;*.xls;*.csv;*.json;*.qmproj)|*.xlsx;*.xls;*.csv;*.json;*.qmproj|All files (*.*)|*.*"
        : "EasyCalc projects (*.qmproj)|*.qmproj|All files (*.*)|*.*";
  const macPrompt =
    kind === 'pricelist' ? 'Choose a pricelist file'
      : kind === 'list' ? 'Choose a list (spreadsheet, export, or project)'
        : 'Open EasyCalc project';
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run('powershell', [
        '-NoProfile', '-STA', '-Command',
        `${PS_FG_OWNER}$f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = '${winFilter}'; if ($f.ShowDialog($o) -eq 'OK') { $f.FileName }`,
      ]);
      return stdout.trim() || null;
    }
    if (process.platform === 'darwin') {
      const { stdout } = await run('osascript', [
        '-e', `POSIX path of (choose file with prompt "${macPrompt}")`,
      ]);
      return stdout.trim() || null;
    }
    return null;
  } catch {
    return null; // dialog cancelled
  }
}

// Native "Save As" dialog — lets the user browse folders, make new ones, and
// name/overwrite the .qmproj file, instead of typing a path.
async function nativeSaveDialog(suggested?: string): Promise<string | null> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const q = (s: string) => s.replace(/'/g, "''"); // escape for a PS single-quoted string
  try {
    if (process.platform === 'win32') {
      const name = q(suggested ? basename(suggested) : 'New Project.qmproj');
      const initDir = q(suggested ? dirname(suggested) : PROJECTS_DIR);
      const ps =
        `${PS_FG_OWNER}$f = New-Object System.Windows.Forms.SaveFileDialog; ` +
        `$f.Filter = 'EasyCalc projects (*.qmproj)|*.qmproj|All files (*.*)|*.*'; $f.DefaultExt='qmproj'; $f.AddExtension=$true; ` +
        `$f.FileName='${name}'; $f.InitialDirectory='${initDir}'; if ($f.ShowDialog($o) -eq 'OK') { $f.FileName }`;
      const { stdout } = await run('powershell', ['-NoProfile', '-STA', '-Command', ps]);
      return stdout.trim() || null;
    }
    if (process.platform === 'darwin') {
      const name = (suggested ? basename(suggested) : 'New Project.qmproj').replace(/"/g, '\\"');
      const { stdout } = await run('osascript', [
        '-e', `POSIX path of (choose file name with prompt "Save EasyCalc project" default name "${name}")`,
      ]);
      return stdout.trim() || null;
    }
    return null;
  } catch {
    return null; // dialog cancelled
  }
}

app.post('/api/browse-save', async (req) => {
  const { suggested } = (req.body ?? {}) as { suggested?: string };
  return { path: await nativeSaveDialog(suggested) };
});

app.post('/api/browse-open', async () => ({ path: await nativeOpenDialog('project') }));

// "Open in a new window" target. Opened synchronously on the click (a real URL,
// so it's never a blank popup), it drives the native dialog itself and then
// navigates to the chosen project — or closes itself if the dialog is cancelled.
app.get('/open', async (_req, reply) =>
  reply.type('text/html').send(
    `<!doctype html><meta charset=utf-8><title>Opening…</title>` +
    `<body style="font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#141821;color:#cdd6e0">` +
    `<div>Opening project…</div><script>` +
    `fetch('/api/browse-open',{method:'POST'}).then(r=>r.json()).then(({path})=>{` +
    `if(path)location.replace('/?path='+encodeURIComponent(path));else window.close();` +
    `}).catch(()=>window.close());</script>`,
  ),
);
app.post('/api/browse-file', async (req) => {
  const { kind } = (req.body ?? {}) as { kind?: 'project' | 'pricelist' | 'list' };
  const k = kind === 'pricelist' || kind === 'list' ? kind : 'project';
  return { path: await nativeOpenDialog(k) };
});

// Latest FX rates for currency conversion. Cached ~6h; falls back gracefully.
let fxCache: { base: string; rates: Record<string, number>; at: number } | null = null;
app.get('/api/fx', async (req, reply) => {
  const base = String((req.query as any).base || 'AUD').toUpperCase();
  const fresh = fxCache && fxCache.base === base && Date.now() - fxCache.at < 6 * 3600_000;
  if (fresh) return { base, rates: fxCache!.rates, cached: true };
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const data = (await r.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== 'success' || !data.rates) throw new Error('fx lookup failed');
    fxCache = { base, rates: data.rates, at: Date.now() };
    return { base, rates: data.rates };
  } catch (e: any) {
    if (fxCache && fxCache.base === base) return { base, rates: fxCache.rates, stale: true };
    return reply.code(502).send({ error: 'Could not fetch exchange rates: ' + e.message });
  }
});

// ---- self-update from GitHub Releases -------------------------------------
// Public repo → anonymous api.github.com call, no token. Set QM_UPDATE_REPO
// (or edit the fallback) to "owner/repo". Releases must be tagged vX.Y.Z with
// the installer attached as a "*Setup*.exe" asset.
const UPDATE_REPO = process.env.QM_UPDATE_REPO || 'skolvolt/EasyCalc';

function localVersion(): string {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Cached ~1h so restarts don't hammer the API; holds the download URL for /run.
let updateCache: {
  at: number; current: string; latest: string;
  updateAvailable: boolean; downloadUrl?: string; releaseUrl?: string;
} | null = null;

app.get('/api/app-update', async (req) => {
  const current = localVersion();
  // Manual "check now" passes ?refresh=1 to bypass the hourly cache.
  const force = (req.query as { refresh?: string }).refresh === '1';
  if (!force && updateCache && Date.now() - updateCache.at < 3600_000) {
    const { at, downloadUrl, ...pub } = updateCache;
    return pub;
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'EasyCalc' },
    });
    if (!r.ok) return { current, updateAvailable: false };
    const rel = (await r.json()) as {
      tag_name?: string; html_url?: string;
      assets?: { name: string; browser_download_url: string }[];
    };
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    const asset = (rel.assets || []).find((a) => /setup.*\.exe$/i.test(a.name));
    const updateAvailable = !!latest && !!asset && isNewer(current, latest);
    updateCache = {
      at: Date.now(), current, latest, updateAvailable,
      downloadUrl: asset?.browser_download_url, releaseUrl: rel.html_url,
    };
    return { current, latest, updateAvailable, releaseUrl: rel.html_url };
  } catch {
    return { current, updateAvailable: false }; // offline / transient — no nag
  }
});

// Lightweight version probe (no GitHub call) — the UI polls this after kicking
// off an update to detect when the freshly-installed server is back up.
app.get('/api/version', async () => ({ version: localVersion() }));

// Download the installer and launch it. The (per-user, no-admin) installer
// closes this app, replaces the files, then relaunches the server (its own
// [Run] step) — the still-open window polls /api/version and reloads itself.
app.post('/api/app-update/run', async (_req, reply) => {
  if (!updateCache?.downloadUrl) return reply.code(409).send({ error: 'no update available' });
  try {
    const r = await fetch(updateCache.downloadUrl, { headers: { 'User-Agent': 'EasyCalc' } });
    if (!r.ok) throw new Error('installer download failed');
    const exePath = join(tmpdir(), `EasyCalc-Setup-${updateCache.latest}.exe`);
    writeFileSync(exePath, Buffer.from(await r.arrayBuffer()));
    const { spawn } = await import('node:child_process');
    // Silent, close the running server so files unlock, no reboot prompts.
    // Detached + unref so it outlives this process when the installer kills us.
    spawn(exePath, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/CLOSEAPPLICATIONS', '/NORESTART'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return { ok: true };
  } catch (e: any) {
    return reply.code(502).send({ error: e.message, releaseUrl: updateCache.releaseUrl });
  }
});

// Self-contained editable HTML: inlines the built app + embeds project state.
app.get('/api/standalone', async (req, reply) => {
  const { path } = req.query as { path?: string };
  if (!path) return reply.code(400).send({ error: 'path required' });
  let state: ProjectState;
  try {
    state = readProject(path);
  } catch {
    return reply.code(404).send({ error: 'could not read project file' });
  }
  const { readFileSync } = await import('node:fs');
  const dist = WEB_DIST;
  let html = readFileSync(join(dist, 'index.html'), 'utf8');
  // inline <script src="/assets/x.js"> and <link href="/assets/x.css">
  html = html.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (_m, src) => {
    const js = readFileSync(join(dist, src.replace(/^\//, '')), 'utf8');
    return `<script type="module">${js}</script>`;
  });
  html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_m, href) => {
    const css = readFileSync(join(dist, href.replace(/^\//, '')), 'utf8');
    return `<style>${css}</style>`;
  });
  const projName = state.details.project_name || 'EasyCalc project';
  const inject = `<script>window.__QM_EMBEDDED__=${JSON.stringify({ state, name: projName }).replace(/</g, '\\u003c')};</script>`;
  html = html.replace('</head>', `${inject}</head>`);
  const filename = `${projName.replace(/[^\w\- ]+/g, '')}.easycalc.html`.replace(/ +/g, '-');
  return reply
    .header('Content-Type', 'text/html')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(html);
});

app.post('/api/pricelist/check', async (req, reply) => {
  const { file, items } = req.body as { file: string; items: PricelistItemQuery[] };
  try {
    return checkPricelist(file, items);
  } catch (e: any) {
    return reply.code(400).send({ error: e.message });
  }
});

const parseDoc = (q: { doc?: string; typeIdx?: string }): DocKind =>
  q.doc === 'room'
    ? { kind: 'room', typeIdx: Number(q.typeIdx ?? 0) }
    : q.doc === 'total'
      ? { kind: 'total' }
      : q.doc === 'matrix'
        ? { kind: 'matrix' }
        : q.doc === 'workbook'
          ? { kind: 'workbook' }
          : { kind: 'summary' };

/**
 * Standardised export filename from the dashboard entries, e.g.
 * JO123456_GOOGLE_PYRMONT_V1_JN_20260707_ROOMSUMMARY.pdf
 * (job no · client · site · version · preparer initials · date · document).
 */
function standardFilename(state: ProjectState, doc: DocKind, prices: boolean, ext: string): string {
  const d = state.details;
  const seg = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const jo = (() => {
    const n = seg(d.project_number);
    return n ? (n.startsWith('JO') ? n : 'JO' + n) : 'JO000000';
  })();
  const client = seg(d.client_name) || 'CLIENT';
  const site = seg(d.client_site) || 'SITE';
  const ver = 'V' + (seg(d.version) || '1');
  const initials =
    String(d.quoted_by ?? '').trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || 'XX';
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rt = doc.kind === 'room' ? state.room_types.find((t) => t.idx === doc.typeIdx) : undefined;
  const docLabel =
    doc.kind === 'matrix'
      ? 'ROOMMATRIX'
      : doc.kind === 'workbook'
        ? (prices ? 'WORKBOOK' : 'WORKBOOK-NOPRICES')
        : doc.kind === 'summary'
          ? (prices ? 'ROOMSUMMARY' : 'ROOMSCHEDULE')
          : doc.kind === 'room'
            ? (prices ? 'ROOMINVOICE' : 'BILLOFMATERIALS') + (rt ? '-' + seg(rt.name) : '')
            : (prices ? 'TOTALINVOICE' : 'WORKBOOK');
  return `${[jo, client, site, ver, initials, date, docLabel].join('_')}.${ext}`;
}

// GET /api/pdf?path=...&doc=summary|total|room&typeIdx=N&prices=off
app.get('/api/pdf', async (req, reply) => {
  const q = req.query as { path?: string; doc?: string; typeIdx?: string; prices?: string; roomnums?: string; matrix?: string };
  if (!q.path) return reply.code(400).send({ error: 'path required' });
  let state: ProjectState;
  try {
    state = readProject(q.path);
  } catch {
    return reply.code(404).send({ error: 'could not read project file' });
  }
  const doc = parseDoc(q);
  const prices = q.prices !== 'off';
  const { html } = renderDocument(state, doc, { prices, hideRooms: q.roomnums === 'off', matrix: q.matrix === 'on' });
  const pdf = await htmlToPdf(html, doc.kind === 'matrix'); // matrix prints landscape
  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `attachment; filename="${standardFilename(state, doc, prices, 'pdf')}"`)
    .send(pdf);
});

// GET /api/xlsx?path=...&doc=summary|total|room&typeIdx=N
app.get('/api/xlsx', async (req, reply) => {
  const q = req.query as { path?: string; doc?: string; typeIdx?: string; prices?: string; roomnums?: string };
  if (!q.path) return reply.code(400).send({ error: 'path required' });
  let state: ProjectState;
  try {
    state = readProject(q.path);
  } catch {
    return reply.code(404).send({ error: 'could not read project file' });
  }
  const doc = parseDoc(q);
  const { buffer } = renderWorkbook(state, doc, { hideRooms: q.roomnums === 'off' });
  return reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${standardFilename(state, doc, q.prices !== 'off', 'xlsx')}"`)
    .send(buffer);
});

if (existsSync(WEB_DIST)) {
  app.register(fastifyStatic, { root: WEB_DIST });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html');
  });
}

const port = Number(process.env.PORT || 8321);
// Local app: bind to loopback only unless explicitly overridden.
const host = process.env.QM_HOST || '127.0.0.1';
app.listen({ port, host }).then(() => {
  console.log(`quotemodel listening on http://${host}:${port}`);
});
