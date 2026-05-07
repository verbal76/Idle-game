import { IndexedDbStore, SaveData } from './IndexedDbStore';

function ensureDefaults(d: SaveData): SaveData {
  if (!d.upgrades) d.upgrades = { speed: 0, jump: 0, magnet: 0 };
  return d;
}

export class ProfileService {
  private active: SaveData | null = null;

  constructor(private store: IndexedDbStore) {}

  async init(): Promise<void> {
    const id = await this.store.getActiveId();
    if (id) {
      const data = await this.store.get(id);
      this.active = data ? ensureDefaults(data) : null;
    }
  }

  get activeProfile(): SaveData | null { return this.active; }

  async list(): Promise<SaveData[]> {
    const all = await this.store.list();
    return all.map(ensureDefaults);
  }

  async create(name: string): Promise<SaveData> {
    const now = Date.now();
    const data: SaveData = {
      id: crypto.randomUUID(),
      name,
      createdAtMs: now,
      lastPlayedMs: now,
      currency: 0,
      unlocks: [],
      bestHalfPipeScore: 0,
      longestDownhillMeters: 0,
      upgrades: { speed: 0, jump: 0, magnet: 0 },
      settings: { musicVolume: 0.7, sfxVolume: 1 }
    };
    await this.store.put(data);
    return data;
  }

  async setActive(id: string): Promise<void> {
    const data = await this.store.get(id);
    if (!data) throw new Error(`profile ${id} missing`);
    this.active = ensureDefaults(data);
    await this.store.setActiveId(id);
  }

  async save(): Promise<void> {
    if (!this.active) return;
    this.active.lastPlayedMs = Date.now();
    await this.store.put(this.active);
  }

  async deleteProfile(id: string): Promise<void> {
    await this.store.delete(id);
    if (this.active?.id === id) {
      this.active = null;
      await this.store.setActiveId(null);
    }
  }
}
