import type { SaveData } from './IndexedDbStore';
import { SCHEMA_VERSION, loadSave } from './migrate';

/**
 * Portable save backup: every profile as plain text the player can keep
 * anywhere (notes, e-mail to themselves) and paste back later, for example
 * before reinstalling the game under a different signing key, which wipes
 * the app's data.
 *
 * Export drops transient state (an unbanked run in progress). Import
 * validates the whole envelope and runs every profile through the same
 * migration/sanitiser the game uses on load before anything is stored.
 */
export const BACKUP_FORMAT = 'hotattic-wtb-save';
export const BACKUP_VERSION = 1;
export const BACKUP_APP = 'com.hotatticgames.snow';

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: number;
  app: string;
  exportedAt: string;
  schemaVersion: number;
  activeId: string | null;
  profiles: SaveData[];
  /** Detects a truncated or edited paste: FNV-1a of the profiles' JSON. */
  checksum: string;
}

/** 32-bit FNV-1a, hex. Integrity against accidents (truncation, a lost character), not security. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function exportable(p: SaveData): SaveData {
  const copy = JSON.parse(JSON.stringify(p)) as SaveData & { pendingRun?: unknown };
  delete copy.pendingRun;
  return copy;
}

export function buildBackup(profiles: SaveData[], activeId: string | null, now: Date = new Date()): string {
  const list = profiles.map(exportable);
  const env: BackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: BACKUP_APP,
    exportedAt: now.toISOString(),
    schemaVersion: SCHEMA_VERSION,
    activeId: activeId && list.some(p => p.id === activeId) ? activeId : null,
    profiles: list,
    checksum: fnv1a(JSON.stringify(list)),
  };
  return JSON.stringify(env, null, 1);
}

export type ParsedBackup =
  | { ok: true; profiles: SaveData[]; activeId: string | null; exportedAt: string; skipped: number }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const MAX_BACKUP_CHARS = 5_000_000;
export const MAX_PROFILES = 200;

/** Validates pasted text. Never throws; nothing is stored here. */
export function parseBackup(text: unknown): ParsedBackup {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Paste a backup first.' };
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, error: 'That text is too large to be a backup.' };
  // A leading text wrapper from a mail app is tolerated: take the outermost braces.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'That does not look like a backup.' };
  let raw: unknown;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { return { ok: false, error: 'The backup is cut off or damaged (it cannot be read). Copy the whole text again.' }; }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, error: 'That is not a Where’s the Bottom? backup.' };
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the game. Update the game first.' };
  }
  if (!Array.isArray(raw.profiles)) return { ok: false, error: 'The backup has no profiles.' };
  if (raw.profiles.length === 0) return { ok: false, error: 'The backup is empty.' };
  if (raw.profiles.length > MAX_PROFILES) return { ok: false, error: 'The backup has too many profiles.' };
  if (typeof raw.checksum !== 'string' || raw.checksum !== fnv1a(JSON.stringify(raw.profiles))) {
    return { ok: false, error: 'The backup does not match its checksum: some of it was changed or lost. Copy the whole text again.' };
  }
  const profiles: SaveData[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const p of raw.profiles) {
    const clean = loadSave(p);
    if (!clean || seen.has(clean.id)) { skipped++; continue; }
    seen.add(clean.id);
    profiles.push(clean);
  }
  if (profiles.length === 0) return { ok: false, error: 'None of the profiles in the backup could be read.' };
  const activeId = typeof raw.activeId === 'string' && seen.has(raw.activeId) ? raw.activeId : null;
  return { ok: true, profiles, activeId, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '', skipped };
}

export interface RestorePlanRow {
  id: string;
  name: string;
  currency: number;
  runs: number;
  /** What is on this device under the same id, if anything. */
  existing: { name: string; currency: number; runs: number } | null;
  /** The device has MORE progress than the backup for this profile. */
  olderThanDevice: boolean;
}

/** What restoring would do, row by row, for the preview. */
export function planRestore(incoming: SaveData[], local: SaveData[]): RestorePlanRow[] {
  const byId = new Map(local.map(p => [p.id, p]));
  return incoming.map((p) => {
    const e = byId.get(p.id);
    const existing = e ? { name: e.name, currency: e.currency, runs: e.stats.lifetime.runs } : null;
    return {
      id: p.id, name: p.name, currency: p.currency, runs: p.stats.lifetime.runs, existing,
      olderThanDevice: !!existing && (existing.runs > p.stats.lifetime.runs || existing.currency > p.currency),
    };
  });
}
