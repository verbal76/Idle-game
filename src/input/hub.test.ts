import { describe, expect, it } from 'vitest';
import { PAD } from './actions';
import { InputHub, snapshotOf, type HubEvent } from './hub';
import type { PadSnapshot } from './gamepad';

const mk = (id: string, down: number[] = [], axes: number[] = [0, 0, 0, 0]): PadSnapshot => {
  const buttons = Array.from({ length: 17 }, () => false);
  for (const i of down) buttons[i] = true;
  return { id, axes, buttons };
};
const XBOX = 'Xbox Wireless Controller 045e';

function rig() {
  let pads: Array<PadSnapshot | null> = [];
  let t = 0;
  const hub = new InputHub({ getPads: () => pads, now: () => t });
  const events: HubEvent[] = [];
  hub.on((e) => events.push(e));
  return {
    hub, events,
    set(p: Array<PadSnapshot | null>) { pads = p; },
    tick(ms = 16) { t += ms; hub.poll(); },
    navs: () => events.filter((e) => e.type === 'nav').map((e) => (e as { action: string }).action),
  };
}

describe('hot connect / disconnect', () => {
  it('reports connect once with the pad family, and disconnect once', () => {
    const r = rig();
    r.tick();
    expect(r.hub.connected).toBe(false);
    r.set([mk(XBOX)]);
    r.tick(); r.tick();
    expect(r.events.filter((e) => e.type === 'connect')).toEqual([{ type: 'connect', id: XBOX, family: 'xbox' }]);
    expect(r.hub.connected).toBe(true);
    r.set([null]);
    r.tick(); r.tick();
    expect(r.events.filter((e) => e.type === 'disconnect')).toHaveLength(1);
    expect(r.hub.connected).toBe(false);
    expect(r.hub.gameplay).toEqual({ steerX: 0, carve: false, jump: false, flip: false });
  });
  it('disconnecting with buttons held leaves nothing stuck', () => {
    const r = rig();
    r.set([mk(XBOX)]); r.tick();
    r.set([mk(XBOX, [PAD.south, PAD.lb], [1, 0, 0, 0])]); r.tick();
    expect(r.hub.gameplay).toMatchObject({ jump: true, carve: true, steerX: 1 });
    r.set([null]); r.tick();
    expect(r.hub.gameplay).toEqual({ steerX: 0, carve: false, jump: false, flip: false });
  });
  it('reconnecting after a disconnect works, and a different pad takes over', () => {
    const r = rig();
    r.set([mk(XBOX)]); r.tick();
    r.set([null]); r.tick();
    r.set([mk('DualSense 054c')]); r.tick();
    const connects = r.events.filter((e) => e.type === 'connect') as Array<{ family: string }>;
    expect(connects.map((c) => c.family)).toEqual(['xbox', 'playstation']);
  });
  it('a pad that is already held down when it appears is not a menu press', () => {
    const r = rig();
    r.set([mk(XBOX, [PAD.south])]); r.tick(); r.tick();
    expect(r.navs()).toEqual([]);
    expect(r.hub.gameplay.jump).toBe(false);            // held at connect: ignored until released
    r.set([mk(XBOX)]); r.tick();
    r.set([mk(XBOX, [PAD.south])]); r.tick();
    expect(r.hub.gameplay.jump).toBe(true);
    expect(r.navs()).toEqual(['confirm']);
  });
});

describe('menu navigation events', () => {
  it('South = confirm, East = back, Start = menu: once per press, not while held', () => {
    const r = rig();
    r.set([mk(XBOX)]); r.tick();
    for (const [b, a] of [[PAD.south, 'confirm'], [PAD.east, 'back'], [PAD.start, 'menu']] as const) {
      r.set([mk(XBOX, [b])]); r.tick(); r.tick(); r.tick();
      r.set([mk(XBOX)]); r.tick();
      expect(r.navs().filter((x) => x === a)).toHaveLength(1);
    }
  });
  it('a held d-pad direction repeats after a delay', () => {
    const r = rig();
    r.set([mk(XBOX)]); r.tick();
    r.set([mk(XBOX, [PAD.down])]);
    r.tick(0);
    for (let i = 0; i < 40; i++) r.tick(16);            // ~640 ms
    const downs = r.navs().filter((x) => x === 'down').length;
    expect(downs).toBeGreaterThanOrEqual(3);
    expect(downs).toBeLessThanOrEqual(5);
  });
  it('the left stick navigates menus too', () => {
    const r = rig();
    r.set([mk(XBOX)]); r.tick();
    r.set([mk(XBOX, [], [0, 0.9, 0, 0])]); r.tick();
    expect(r.navs()).toContain('down');
  });
});

describe('a button still down when the run takes over is ignored until released', () => {
  it('releaseAll (run start / resume / overlay closed) suppresses held jump, then re-arms', () => {
    const r = rig();
    r.set([mk(XBOX)]); r.tick();
    r.set([mk(XBOX, [PAD.south])]); r.tick();                 // A pressed on "Resume"
    r.hub.releaseAll();
    expect(r.hub.gameplay.jump).toBe(false);
    r.tick();
    expect(r.hub.gameplay.jump).toBe(false);                  // still held: still ignored
    r.set([mk(XBOX)]); r.tick();
    r.set([mk(XBOX, [PAD.south])]); r.tick();
    expect(r.hub.gameplay.jump).toBe(true);                   // a fresh press counts
  });
  it('steering is never suppressed', () => {
    const r = rig();
    r.set([mk(XBOX, [], [1, 0, 0, 0])]); r.tick();
    r.hub.releaseAll();
    expect(r.hub.gameplay.steerX).toBe(1);
  });
});

describe('browser adapter', () => {
  it('uses only standard-mapping, connected pads', () => {
    const g = (over: object) => ({ id: 'x', connected: true, mapping: 'standard', axes: [0.5, 0], buttons: [{ pressed: true, value: 1 }, { pressed: false, value: 0.7 }, { pressed: false, value: 0 }], ...over }) as unknown as Gamepad;
    expect(snapshotOf(null)).toBeNull();
    expect(snapshotOf(g({ mapping: '' }))).toBeNull();
    expect(snapshotOf(g({ connected: false }))).toBeNull();
    expect(snapshotOf(g({}))).toEqual({ id: 'x', axes: [0.5, 0], buttons: [true, true, false] });
  });
});
