import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface UpgradeLevels {
  speed: number;
  jump: number;
  magnet: number;
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
  settings: { musicVolume: number; sfxVolume: number };
}

interface BoarderDB extends DBSchema {
  profiles: { key: string; value: SaveData };
  meta: { key: string; value: string };
}

const DB_NAME = 'boarder';
const DB_VERSION = 1;
const ACTIVE_KEY = 'activeProfileId';

export class IndexedDbStore {
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
