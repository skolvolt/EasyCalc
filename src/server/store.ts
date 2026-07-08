import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync,
} from 'node:fs';
import { join, dirname, resolve, basename, extname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { ProjectState, CatalogueItem } from '../shared/types';

const dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.QM_DATA_DIR || join(dir, '../../data');
const SEED_PATH = join(DATA_DIR, 'seed.json');

/** Default save location: My Documents\Project Model */
export const PROJECTS_DIR =
  process.env.QM_PROJECTS_DIR || join(homedir(), 'Documents', 'Project Model');
const RECENTS_PATH = join(PROJECTS_DIR, '.recents.json');
/** User-set default equipment list applied to new projects (see set-as-default). */
const DEFAULT_CATALOGUE_PATH = join(PROJECTS_DIR, '.default-catalogue.json');

export const PROJECT_EXT = '.qmproj';

mkdirSync(PROJECTS_DIR, { recursive: true });

/** The saved default equipment list, or null to fall back to the seed. */
export function readDefaultCatalogue(): CatalogueItem[] | null {
  try {
    const items = JSON.parse(readFileSync(DEFAULT_CATALOGUE_PATH, 'utf8'));
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
}

export function writeDefaultCatalogue(items: CatalogueItem[]): void {
  writeFileSync(DEFAULT_CATALOGUE_PATH, JSON.stringify(items));
}

/**
 * The workbook seed carries 10 placeholder rooms (one pre-assigned per type
 * column — an Excel formula requirement). New projects start with a single
 * blank room instead, and use the user's default equipment list if one was set.
 */
export function newProjectState(name?: string): ProjectState {
  const seed: ProjectState = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  seed.rooms = [{ level: '', area: '', room_no: '', types: [] }];
  const defaults = readDefaultCatalogue();
  if (defaults) seed.catalogue = defaults;
  if (name) seed.details.project_name = name;
  return seed;
}

interface RecentsFile {
  recents: string[];
  /** Set by "Clear recents" — default-dir files older than this stay hidden
   *  from the home list until opened or saved again. */
  clearedAt: string;
  /** Individually dismissed entries — hidden until opened or saved again. */
  dismissed: string[];
}

function readRecentsFile(): RecentsFile {
  try {
    const parsed = JSON.parse(readFileSync(RECENTS_PATH, 'utf8'));
    if (Array.isArray(parsed)) return { recents: parsed, clearedAt: '', dismissed: [] }; // legacy
    return { recents: parsed.recents ?? [], clearedAt: parsed.clearedAt ?? '', dismissed: parsed.dismissed ?? [] };
  } catch {
    return { recents: [], clearedAt: '', dismissed: [] };
  }
}

export function touchRecent(path: string): void {
  const abs = resolve(path);
  const file = readRecentsFile();
  file.recents = [abs, ...file.recents.filter((p) => p !== abs)].slice(0, 12);
  file.dismissed = file.dismissed.filter((p) => resolve(p) !== abs); // opening un-dismisses
  writeFileSync(RECENTS_PATH, JSON.stringify(file, null, 1));
}

/** Remove a single entry from the home list (does not delete the file). */
export function dismissRecent(path: string): void {
  const abs = resolve(path);
  const file = readRecentsFile();
  file.recents = file.recents.filter((p) => resolve(p) !== abs);
  if (!file.dismissed.map((p) => resolve(p)).includes(abs)) file.dismissed.push(abs);
  writeFileSync(RECENTS_PATH, JSON.stringify(file, null, 1));
}

/** Clear the recents history (does not delete any project files). */
export function clearRecents(): void {
  const cleared: RecentsFile = { recents: [], clearedAt: new Date().toISOString(), dismissed: [] };
  writeFileSync(RECENTS_PATH, JSON.stringify(cleared, null, 1));
}

export interface ProjectListing {
  path: string;
  name: string;
  updatedAt: string;
  inDefaultDir: boolean;
}

export function listProjects(): { defaultDir: string; projects: ProjectListing[] } {
  const seen = new Set<string>();
  const projects: ProjectListing[] = [];
  const push = (path: string, inDefaultDir: boolean) => {
    const abs = resolve(path);
    if (seen.has(abs) || !existsSync(abs)) return;
    seen.add(abs);
    try {
      const state: ProjectState = JSON.parse(readFileSync(abs, 'utf8'));
      projects.push({
        path: abs,
        name:
          state.details?.project_name ||
          basename(abs, PROJECT_EXT),
        updatedAt: statSync(abs).mtime.toISOString(),
        inDefaultDir,
      });
    } catch {
      /* unreadable/corrupt file — skip */
    }
  };
  const { recents, clearedAt, dismissed } = readRecentsFile();
  const recentSet = new Set(recents.map((p) => resolve(p)));
  const dismissedSet = new Set(dismissed.map((p) => resolve(p)));
  for (const f of readdirSync(PROJECTS_DIR)) {
    if (extname(f) !== PROJECT_EXT) continue;
    const abs = resolve(join(PROJECTS_DIR, f));
    if (dismissedSet.has(abs)) continue;
    if (clearedAt && !recentSet.has(abs)) {
      try {
        if (statSync(abs).mtime.toISOString() <= clearedAt) continue;
      } catch {
        continue;
      }
    }
    push(abs, true);
  }
  for (const p of recents) push(p, false);
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { defaultDir: PROJECTS_DIR, projects };
}

/** File modification time (ISO) for change-detection, or null if missing. */
export function projectMtime(path: string): string | null {
  try {
    return statSync(resolve(path)).mtime.toISOString();
  } catch {
    return null;
  }
}

export function readProject(path: string): ProjectState {
  const state: ProjectState = JSON.parse(readFileSync(resolve(path), 'utf8'));
  // migrate legacy single-logo projects: the old `logo` doubled as sidebar
  // branding, which is now the display-only client logo
  const d = state.details;
  if (d && d.logo && !d.client_logo) {
    d.client_logo = d.logo;
    d.logo = null;
  }
  // migrate legacy project-level notes/floorplan onto the first room type
  // (notes/floorplan are now per-room-type)
  if (d && (d.room_summary_notes || d.floorplan_image)
    && state.room_types?.length && !state.room_types.some((rt) => rt.notes || rt.floorplan)) {
    const first = state.room_types[0];
    if (d.room_summary_notes) first.notes = d.room_summary_notes;
    if (d.floorplan_image) first.floorplan = d.floorplan_image;
    d.room_summary_notes = null;
    d.floorplan_image = null;
  }
  return state;
}

// ---- app-level settings (default company letterhead logo) ----
const SETTINGS_PATH = join(PROJECTS_DIR, '.settings.json');

export interface AppSettings {
  company_logo?: string | null;
  company_logo_default?: boolean;
  company_name?: string | null;
  company_phone?: string | null;
  company_address?: string | null;
  company_website?: string | null;
}

export function readSettings(): AppSettings {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function writeSettings(patch: AppSettings): AppSettings {
  const merged = { ...readSettings(), ...patch };
  writeFileSync(SETTINGS_PATH, JSON.stringify(merged));
  return merged;
}

export function writeProject(path: string, state: ProjectState): string {
  let abs = resolve(path);
  if (extname(abs) !== PROJECT_EXT) abs += PROJECT_EXT;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(state));
  touchRecent(abs);
  return abs;
}

/** Create a new project file in the default folder with a unique filename. */
export function createProject(name: string): { path: string; state: ProjectState } {
  const state = newProjectState(name);
  const settings = readSettings();
  // "Add by default" copies the saved company letterhead (logo + details) onto new projects.
  if (settings.company_logo_default) {
    const d = state.details;
    if (settings.company_logo) d.company_logo = settings.company_logo;
    if (settings.company_name) d.company_name = settings.company_name;
    if (settings.company_phone) d.company_phone = settings.company_phone;
    if (settings.company_address) d.company_address = settings.company_address;
    if (settings.company_website) d.company_website = settings.company_website;
  }
  const safe = (name || 'New Project').replace(/[\\/:*?"<>|]+/g, '').trim() || 'New Project';
  let path = join(PROJECTS_DIR, safe + PROJECT_EXT);
  let n = 2;
  while (existsSync(path)) path = join(PROJECTS_DIR, `${safe} (${n++})${PROJECT_EXT}`);
  writeProject(path, state);
  return { path, state };
}
