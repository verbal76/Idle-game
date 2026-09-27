import type { ProfileStore, SaveData } from '../profiles/IndexedDbStore';

/** In-memory ProfileStore that round-trips through structuredClone like IndexedDB. */
export class MemoryStore implements ProfileStore {
  readonly rows = new Map<string, SaveData>();
  activeId: string | null = null;
  async list() { return [...this.rows.values()].map(r => structuredClone(r)); }
  async get(id: string) { const r = this.rows.get(id); return r && structuredClone(r); }
  async put(p: SaveData) { this.rows.set(p.id, structuredClone(p)); }
  async delete(id: string) { this.rows.delete(id); }
  async getActiveId() { return this.activeId; }
  async setActiveId(id: string | null) { this.activeId = id; }
}
