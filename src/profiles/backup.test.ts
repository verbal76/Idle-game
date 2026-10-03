import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, MAX_BACKUP_CHARS, buildBackup, fnv1a, parseBackup, planRestore } from './backup';
import { ProfileService } from './ProfileService';
import { MemoryStore } from '../test/memoryStore';
import type { SaveData } from './IndexedDbStore';

async function seeded() {
  const store = new MemoryStore();
  const svc = new ProfileService(store);
  const a = await svc.create('Frosty');
  const b = await svc.create('Gale');
  await svc.setActive(a.id);
  svc.activeProfile!.currency = 123.5;
  svc.activeProfile!.upgrades.speed = 4;
  svc.activeProfile!.stats.lifetime.runs = 17;
  svc.activeProfile!.milestones = ['runs-10'];
  svc.activeProfile!.pendingRun = { runId: 'r', savedAtMs: 1, mode: 'downhill', distanceMeters: 40, flips: 0, spins: 0, coins: 0, rings: 0, bestCombo: 0, bestRingStreak: 0 } as never;
  await svc.save();
  return { store, svc, a, b };
}

describe('save backup', () => {
  it('round-trips every profile, keeping progress, and leaves out an unbanked run', async () => {
    const { svc, a, b } = await seeded();
    const text = buildBackup(await svc.list(), svc.activeProfile!.id);
    const out = parseBackup(text);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.profiles.map(p => p.id).sort()).toEqual([a.id, b.id].sort());
    const frosty = out.profiles.find(p => p.id === a.id)!;
    expect(frosty.currency).toBe(123.5);
    expect(frosty.upgrades.speed).toBe(4);
    expect(frosty.stats.lifetime.runs).toBe(17);
    expect(frosty.milestones).toEqual(['runs-10']);
    expect((frosty as { pendingRun?: unknown }).pendingRun).toBeUndefined();
    expect(out.activeId).toBe(a.id);
    expect(out.skipped).toBe(0);
  });

  it('is labelled, versioned and checksummed plain text', async () => {
    const { svc } = await seeded();
    const env = JSON.parse(buildBackup(await svc.list(), null)) as Record<string, unknown>;
    expect(env.format).toBe(BACKUP_FORMAT);
    expect(env.version).toBe(1);
    expect(env.app).toBe('com.hotatticgames.snow');
    expect(typeof env.exportedAt).toBe('string');
    expect(env.activeId).toBeNull();
    expect(env.checksum).toBe(fnv1a(JSON.stringify(env.profiles)));
  });

  it('tolerates text around it (a mail app) but nothing else', async () => {
    const { svc } = await seeded();
    const text = buildBackup(await svc.list(), null);
    expect(parseBackup(`Here is my backup:\n\n${text}\n\nSent from my phone`).ok).toBe(true);
  });

  it('rejects empty, junk, other JSON, truncated and edited text without throwing', async () => {
    const { svc } = await seeded();
    const text = buildBackup(await svc.list(), null);
    const bad = (t: unknown) => { const r = parseBackup(t); expect(r.ok).toBe(false); return r.ok ? '' : r.error; };
    bad(''); bad('   '); bad(undefined); bad(42); bad('hello'); bad('{}'); bad('[1,2]'); bad('{"a":');
    bad('{"format":"something-else","version":1,"profiles":[]}');
    expect(bad(text.slice(0, text.length - 40))).toMatch(/cut off|damaged|backup/i);
    // one character of a profile changed: the checksum catches it
    expect(bad(text.replace('"currency": 123.5', '"currency": 999999'))).toMatch(/checksum/i);
    bad('x'.repeat(MAX_BACKUP_CHARS + 1));
  });

  it('rejects a backup from a newer version and an empty one', () => {
    const profiles: SaveData[] = [];
    const env = (over: object) => JSON.stringify({ format: BACKUP_FORMAT, version: 1, app: 'x', exportedAt: '', schemaVersion: 2, activeId: null, profiles, checksum: fnv1a(JSON.stringify(profiles)), ...over });
    const newer = parseBackup(env({ version: 99 }));
    expect(newer.ok).toBe(false);
    if (!newer.ok) expect(newer.error).toMatch(/newer/);
    const empty = parseBackup(env({}));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toMatch(/empty/);
  });

  it('runs profiles through the game’s own sanitiser; unreadable ones are left out and counted', () => {
    const good = { id: 'g', name: '  Zed​ ', createdAtMs: 1, lastPlayedMs: 2, currency: Number.NaN, unlocks: [], bestHalfPipeScore: 0, longestDownhillMeters: 0, upgrades: { speed: -3 }, settings: {}, stats: {}, milestones: [] };
    const junk = [good, { name: 'no id' }, 7, null, { ...good, id: 'g' }];
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 1, app: 'x', exportedAt: '', schemaVersion: 2, activeId: 'missing', profiles: junk, checksum: fnv1a(JSON.stringify(junk)) });
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profiles).toHaveLength(1);
    expect(r.skipped).toBe(4);                 // no id, number, null, duplicate id
    const p = r.profiles[0]!;
    expect(p.name).toBe('Zed');
    expect(p.currency).toBe(0);                // NaN never reaches the balance
    expect(p.upgrades.speed).toBe(0);
    expect(r.activeId).toBeNull();             // unknown active id ignored
  });

  it('plans a restore row by row and flags a device that is ahead', async () => {
    const { svc, a, b } = await seeded();
    const local = await svc.list();
    const incoming = local.map(p => structuredClone(p));
    incoming.find(p => p.id === a.id)!.stats.lifetime.runs = 3;     // older than the device
    incoming.push({ ...structuredClone(b), id: 'new-one', name: 'Newcomer' });
    const rows = planRestore(incoming, local);
    expect(rows.find(r => r.id === a.id)!.olderThanDevice).toBe(true);
    expect(rows.find(r => r.id === b.id)!.olderThanDevice).toBe(false);
    expect(rows.find(r => r.id === 'new-one')!.existing).toBeNull();
  });
});

describe('ProfileService.importProfiles', () => {
  it('adds new profiles, replaces matching ids, keeps the rest, and swaps the active one in memory', async () => {
    const { svc, store, a, b } = await seeded();
    const backup = parseBackup(buildBackup(await svc.list(), a.id));
    if (!backup.ok) throw new Error('backup');
    // the device moves on after the backup
    svc.activeProfile!.currency = 5;
    await svc.save();
    const extra = await svc.create('Only here');
    const r = await svc.importProfiles(backup.profiles, backup.activeId);
    expect(r).toEqual({ added: 0, replaced: 2 });
    expect(svc.activeProfile!.currency).toBe(123.5);              // memory replaced, so a queued save can't undo it
    await svc.save();
    expect((await store.get(a.id))!.currency).toBe(123.5);
    expect(await store.get(b.id)).toBeDefined();
    expect(await store.get(extra.id)).toBeDefined();              // not in the backup: kept
  });

  it('after a wipe (fresh install) the backup restores everything and activates the saved profile', async () => {
    const { svc, a } = await seeded();
    const backup = parseBackup(buildBackup(await svc.list(), a.id));
    if (!backup.ok) throw new Error('backup');
    const fresh = new ProfileService(new MemoryStore());
    await fresh.init();
    expect(fresh.activeProfile).toBeNull();
    const r = await fresh.importProfiles(backup.profiles, backup.activeId);
    expect(r).toEqual({ added: 2, replaced: 0 });
    expect(fresh.activeProfile!.id).toBe(a.id);
    expect(fresh.activeProfile!.upgrades.speed).toBe(4);
    expect((await fresh.list()).map(p => p.name).sort()).toEqual(['Frosty', 'Gale']);
  });

  it('a failing store reports the error instead of claiming success', async () => {
    const { svc, a } = await seeded();
    const backup = parseBackup(buildBackup(await svc.list(), a.id));
    if (!backup.ok) throw new Error('backup');
    class Broken extends MemoryStore { override async put(): Promise<void> { throw new Error('QuotaExceededError'); } }
    const broken = new ProfileService(new Broken());
    await expect(broken.importProfiles(backup.profiles, null)).rejects.toThrow(/Quota/);
  });
});
