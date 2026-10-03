import type { ProfileStore, SaveData } from './IndexedDbStore';
import { SCHEMA_VERSION, defaultUpgrades, loadSave, normalizeName } from './migrate';
import { defaultStats } from '../game/records';

/** 'ok' once the last write landed; 'failing' while writes are being retried. */
export type SaveStatus = 'ok' | 'failing';

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

/**
 * The active profile and every write to storage. Writes are serialised
 * through one queue (each writes the latest state of the profile) and
 * never reject: a failed write is logged, reported through onStatus and
 * retried with backoff until one succeeds, so callers can always await
 * save() without a try/catch and a storage fault can never take down a
 * screen.
 */
export class ProfileService {
  private active: SaveData | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: SaveStatus) => void>();
  status: SaveStatus = 'ok';

  constructor(private store: ProfileStore, private readonly retryBaseMs = RETRY_BASE_MS) {}

  /** Loads the last active profile. A missing or unreadable one leaves none active (the picker shows). */
  async init(): Promise<void> {
    const id = await this.store.getActiveId();
    if (!id) return;
    const data = loadSave(await this.store.get(id));
    this.active = data;
    if (!data) {
      console.warn('[profiles] active profile missing or unreadable; showing the picker');
      try { await this.store.setActiveId(null); } catch (e) { console.error('[profiles] clear active', e); }
    }
  }

  get activeProfile(): SaveData | null { return this.active; }

  /** Every readable profile, oldest first. One damaged row never hides the others. */
  async list(): Promise<SaveData[]> {
    const rows = await this.store.list();
    const out: SaveData[] = [];
    for (const r of rows) {
      const d = loadSave(r);
      if (d) out.push(d); else console.warn('[profiles] skipped an unreadable profile row');
    }
    return out.sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async create(name: string): Promise<SaveData> {
    const now = Date.now();
    const data: SaveData = {
      id: crypto.randomUUID(),
      name: normalizeName(name),
      createdAtMs: now,
      lastPlayedMs: now,
      currency: 0,
      unlocks: [],
      bestHalfPipeScore: 0,
      longestDownhillMeters: 0,
      upgrades: defaultUpgrades(),
      settings: { musicVolume: 0.7, sfxVolume: 1, haptics: true },
      seenHalfpipeIntro: false,
      stats: defaultStats(),
      milestones: [],
    };
    (data as unknown as { schemaVersion: number }).schemaVersion = SCHEMA_VERSION;
    await this.store.put(data);
    return data;
  }

  /**
   * Makes a profile active. The pointer is written first, so a failure
   * leaves memory and disk agreeing on the previous profile. Re-selecting
   * the active profile keeps its in-memory state.
   */
  async setActive(id: string): Promise<void> {
    if (this.active?.id === id) { await this.store.setActiveId(id); return; }
    const data = loadSave(await this.store.get(id));
    if (!data) throw new Error(`profile ${id} missing or unreadable`);
    await this.store.setActiveId(id);
    // Anything still queued for the old profile is written first.
    await this.queue;
    this.active = data;
  }

  /**
   * Queues a write of the active profile. Resolves true once it (or a
   * later write) landed, false if it failed; a failure is retried in the
   * background. Never rejects.
   */
  save(): Promise<boolean> {
    const p = this.active;
    if (!p) return Promise.resolve(true);
    const run = this.queue.then(() => {
      p.lastPlayedMs = Date.now();
      return this.store.put(p);
    }).then(
      () => { this.succeeded(); return true; },
      (e: unknown) => { this.failed(e); return false; },
    );
    this.queue = run;
    return run;
  }

  onStatus(fn: (s: SaveStatus) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  async rename(id: string, name: string): Promise<SaveData | null> {
    const clean = normalizeName(name);
    if (this.active?.id === id) {
      this.active.name = clean;
      return (await this.save()) ? this.active : null;
    }
    const data = loadSave(await this.store.get(id));
    if (!data) return null;
    data.name = clean;
    await this.store.put(data);
    return data;
  }

  async deleteProfile(id: string): Promise<void> {
    await this.queue;
    if (this.active?.id === id) {
      // Drop the in-memory profile first so no queued or retried save
      // can bring the row back.
      this.active = null;
      this.clearRetry();
      await this.store.setActiveId(null);
    }
    await this.store.delete(id);
  }

  /**
   * Stores validated profiles from a backup (see backup.ts), replacing any
   * stored under the same id and keeping every other profile. The active
   * profile, if replaced, is swapped in memory too so a queued save can't
   * write the old one back. Resolves with what changed; a store failure
   * throws with nothing half-reported (profiles already written stay).
   */
  async importProfiles(incoming: SaveData[], activeId: string | null): Promise<{ added: number; replaced: number }> {
    await this.queue;
    let added = 0, replaced = 0;
    for (const raw of incoming) {
      const p = loadSave(raw);
      if (!p) continue;
      const existed = !!(await this.store.get(p.id));
      await this.store.put(p);
      if (this.active?.id === p.id) this.active = p;
      if (existed) replaced++; else added++;
    }
    if (!this.active && activeId && incoming.some(p => p.id === activeId)) {
      try { await this.setActive(activeId); } catch (e) { console.error('[profiles] activate after import', e); }
    }
    return { added, replaced };
  }

  private succeeded(): void {
    this.failures = 0;
    this.clearRetry();
    this.setStatus('ok');
  }

  private failed(e: unknown): void {
    this.failures++;
    console.error('[profiles] save failed', e);
    this.setStatus('failing');
    if (this.retryTimer === null && this.active) {
      const delay = Math.min(RETRY_MAX_MS, this.retryBaseMs * 2 ** (this.failures - 1));
      this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.save(); }, delay);
    }
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) { clearTimeout(this.retryTimer); this.retryTimer = null; }
  }

  private setStatus(s: SaveStatus): void {
    if (s === this.status) return;
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }
}
