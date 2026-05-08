import { IndexedDbStore, SaveData } from './IndexedDbStore';

function ensureDefaults(d: SaveData): SaveData {
  if (!d.upgrades) {
    d.upgrades = { speed: 0, jump: 0, magnet: 0, turn: 0, charge: 0, spin: 0, coin: 0 };
  } else {
    // Backfill any keys that older saves don't have. Each new upgrade
    // we add gets a `?? 0` lookup here so old profiles continue to
    // load without rewriting them on disk until the next save() pass.
    const u = d.upgrades as Partial<typeof d.upgrades>;
    if (u.turn   === undefined) d.upgrades.turn   = 0;
    if (u.charge === undefined) d.upgrades.charge = 0;
    if (u.spin   === undefined) d.upgrades.spin   = 0;
    if (u.coin   === undefined) d.upgrades.coin   = 0;
  }
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
      upgrades: { speed: 0, jump: 0, magnet: 0, turn: 0, charge: 0, spin: 0, coin: 0 },
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
