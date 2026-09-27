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
  private dbPromise: Promise<IDBPDatabase<BoarderDB>>;

  constructor() {
    this.dbPromise = openDB<BoarderDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      }
    });
  }

  async list(): Promise<SaveData[]> { return (await this.dbPromise).getAll('profiles'); }
  async get(id: string): Promise<SaveData | undefined> { return (await this.dbPromise).get('profiles', id); }
  async put(profile: SaveData): Promise<void> { await (await this.dbPromise).put('profiles', profile); }
  async delete(id: string): Promise<void> { await (await this.dbPromise).delete('profiles', id); }

  async getActiveId(): Promise<string | null> {
    const v = await (await this.dbPromise).get('meta', ACTIVE_KEY);
    return v ?? null;
  }

  async setActiveId(id: string | null): Promise<void> {
    const db = await this.dbPromise;
    if (id) await db.put('meta', id, ACTIVE_KEY);
    else await db.delete('meta', ACTIVE_KEY);
  }
}
