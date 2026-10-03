import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface UpgradeLevels {
  speed: number;
  jump: number;
  // Added 2026-05-08 for the upgrades-everywhere refresh. Old saves
  // that pre-date this stay valid because Game.ts reads upgrade
  // levels via `?? 0` and ProfileService.normalize() backfills any
  // missing key on load before the value is read.
  turn: number;
  charge: number;
  spin: number;
  // Split out of the old combined 'Air Control' (spin) upgrade.
  flip: number;
  coin: number;
  ringMagnet: number;   // half-pipe ring catch radius
  comboWindow: number;  // longer trick-combo window
  grace: number;        // run-ending hits survived per run (max 4)
}

export interface ProfileStats {
  downhill: { bestDistance: number; mostFlips: number };
  halfPipe: { bestRunFlakes: number; bestRingStreak: number; bestCombo: number };
  lifetime: { runs: number; distance: number; flips: number; spins: number; rings: number; flakesEarned: number };
}

export interface SaveData {
  id: string;
  name: string;
  createdAtMs: number;
  lastPlayedMs: number;
  currency: number;
  unlocks: string[];
  bestHalfPipeScore: number;
  longestDownhillMeters: number;
  upgrades: UpgradeLevels;
  settings: { musicVolume: number; sfxVolume: number; haptics: boolean };
  // First-time half-pipe intro already shown to this profile.
  seenHalfpipeIntro?: boolean;
  stats: ProfileStats;
  // Unbanked in-progress run (see game/pendingRun.ts).
  pendingRun?: import('../game/pendingRun').PendingRun;
  // Milestone ids already paid, and today's daily challenges (game/goals.ts).
  milestones: string[];
  daily?: import('../game/goals').DailyState;
}

interface BoarderDB extends DBSchema {
  profiles: { key: string; value: SaveData };
  meta: { key: string; value: string };
}

/** Persistence used by ProfileService (IndexedDB in the app, memory in tests). */
export interface ProfileStore {
  list(): Promise<SaveData[]>;
  get(id: string): Promise<SaveData | undefined>;
  put(profile: SaveData): Promise<void>;
  delete(id: string): Promise<void>;
  getActiveId(): Promise<string | null>;
  setActiveId(id: string | null): Promise<void>;
}

const DB_NAME = 'boarder';
const DB_VERSION = 1;
const ACTIVE_KEY = 'activeProfileId';

export class IndexedDbStore implements ProfileStore {
  private dbPromise: Promise<IDBPDatabase<BoarderDB>> | null = null;

  /**
   * The open connection, opened on first use and re-opened after the
   * browser closes it (storage evicted, another version opened).
   */
  private db(): Promise<IDBPDatabase<BoarderDB>> {
    if (!this.dbPromise) {
      const p = this.open().catch((e: unknown) => {
        // Don't cache a failed open: the next call tries again.
        if (this.dbPromise === p) this.dbPromise = null;
        throw e;
      });
      this.dbPromise = p;
    }
    return this.dbPromise;
  }

  private async open(): Promise<IDBPDatabase<BoarderDB>> {
    const handlers = {
      upgrade(db: IDBPDatabase<BoarderDB>) {
        if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      },
      blocked: () => console.warn('[db] open blocked by another connection'),
      // A newer page wants to upgrade: let it, and reopen on next use.
      blocking: () => { void this.dbPromise?.then(d => d.close()); this.dbPromise = null; },
      terminated: () => { console.warn('[db] connection terminated; will reopen'); this.dbPromise = null; },
    };
    try {
      return await openDB<BoarderDB>(DB_NAME, DB_VERSION, handlers);
    } catch (e) {
      // The database on disk is newer than this build (a rolled-back
      // update): open it at its own version instead of failing to boot.
      if ((e as { name?: string })?.name === 'VersionError') {
        return openDB<BoarderDB>(DB_NAME, undefined, { blocked: handlers.blocked, blocking: handlers.blocking, terminated: handlers.terminated });
      }
      throw e;
    }
  }

  /** Resolves once the database is usable (rejects if it can't be opened). */
  async ready(): Promise<void> { await this.db(); }

  async list(): Promise<SaveData[]> { return (await this.db()).getAll('profiles'); }
  async get(id: string): Promise<SaveData | undefined> { return (await this.db()).get('profiles', id); }
  async put(profile: SaveData): Promise<void> { await (await this.db()).put('profiles', profile); }
  async delete(id: string): Promise<void> { await (await this.db()).delete('profiles', id); }

  async getActiveId(): Promise<string | null> {
    const v = await (await this.db()).get('meta', ACTIVE_KEY);
    return typeof v === 'string' ? v : null;
  }

  async setActiveId(id: string | null): Promise<void> {
    const db = await this.db();
    if (id) await db.put('meta', id, ACTIVE_KEY);
    else await db.delete('meta', ACTIVE_KEY);
  }
}
