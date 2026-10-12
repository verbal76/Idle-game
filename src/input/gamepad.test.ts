import { describe, expect, it } from 'vitest';
import { PAD, PAD_GAMEPLAY, PAD_NAV } from './actions';
import { DIGITAL_NX, NAV_REPEAT_FIRST_MS, NAV_REPEAT_MS, Repeater, STICK_DEAD, STICK_MAX_NX, familyOfId, gameplayOf, navHeldOf, stickToNx, type PadSnapshot } from './gamepad';
import { CARVE_ON, steerFromPosition } from './steerMap';

const pad = (over: Partial<{ axes: number[]; down: number[]; id: string }> = {}): PadSnapshot => {
  const buttons = Array.from({ length: 17 }, () => false);
  for (const i of over.down ?? []) buttons[i] = true;
  return { id: over.id ?? 'Xbox', axes: over.axes ?? [0, 0, 0, 0], buttons };
};

describe('stick -> steering (same curve as the touch strip)', () => {
  it('drift inside the dead zone steers nothing', () => {
    expect(stickToNx(STICK_DEAD * 0.9, 0)).toBe(0);
    expect(gameplayOf(pad({ axes: [0.1, 0.05, 0, 0] })).steerX).toBe(0);
  });
  it('a full throw is full steering but never reaches the carve zone', () => {
    expect(stickToNx(1, 0)).toBeCloseTo(STICK_MAX_NX, 6);
    expect(STICK_MAX_NX).toBeLessThan(CARVE_ON);
    expect(steerFromPosition(STICK_MAX_NX, false).carve).toBe(false);
    expect(gameplayOf(pad({ axes: [1, 0, 0, 0] })).steerX).toBe(1);
    expect(gameplayOf(pad({ axes: [-1, 0, 0, 0] })).steerX).toBe(-1);
  });
  it('steering is progressive and symmetric', () => {
    const a = gameplayOf(pad({ axes: [0.4, 0, 0, 0] })).steerX;
    const b = gameplayOf(pad({ axes: [0.7, 0, 0, 0] })).steerX;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(gameplayOf(pad({ axes: [-0.4, 0, 0, 0] })).steerX).toBeCloseTo(-a, 9);
  });
  it('pushing straight up or down does not steer', () => {
    expect(gameplayOf(pad({ axes: [0, -1, 0, 0] })).steerX).toBe(0);
    expect(gameplayOf(pad({ axes: [0, 1, 0, 0] })).steerX).toBe(0);
  });
  it('garbage axis values are treated as centred', () => {
    expect(stickToNx(NaN, Infinity)).toBe(0);
    expect(gameplayOf({ id: 'x', axes: [], buttons: [] }).steerX).toBe(0);
  });
  it('the d-pad steers like a thumb on the strip; both sides cancel', () => {
    expect(gameplayOf(pad({ down: [PAD.right] })).steerX).toBe(steerFromPosition(DIGITAL_NX, false).x);
    expect(gameplayOf(pad({ down: [PAD.left] })).steerX).toBeLessThan(0);
    expect(gameplayOf(pad({ down: [PAD.left, PAD.right] })).steerX).toBe(0);
  });
});

describe('button map: every touch action has a pad button', () => {
  it('jump = South or RT; flip = West or RB; carve = LB or LT', () => {
    expect(gameplayOf(pad({ down: [PAD.south] })).jump).toBe(true);
    expect(gameplayOf(pad({ down: [PAD.rt] })).jump).toBe(true);
    expect(gameplayOf(pad({ down: [PAD.west] })).flip).toBe(true);
    expect(gameplayOf(pad({ down: [PAD.rb] })).flip).toBe(true);
    expect(gameplayOf(pad({ down: [PAD.lb] })).carve).toBe(true);
    expect(gameplayOf(pad({ down: [PAD.lt] })).carve).toBe(true);
  });
  it('buttons are independent (FLIP while carving = back flip needs both)', () => {
    const g = gameplayOf(pad({ down: [PAD.lb, PAD.west] }));
    expect(g).toMatchObject({ carve: true, flip: true, jump: false });
  });
  it('North, East, Start and the sticks’ clicks do nothing in a run', () => {
    for (const b of [PAD.north, PAD.east, PAD.start, PAD.select, PAD.l3, PAD.r3]) {
      expect(gameplayOf(pad({ down: [b] }))).toEqual({ steerX: 0, carve: false, jump: false, flip: false });
    }
  });
  it('gameplay and menu tables never share a button for opposite meanings in one context', () => {
    // South is Jump in a run and Select in a menu: that is the intended dual use,
    // the hub suppresses a held South at every context change.
    expect(PAD_GAMEPLAY.jump).toContain(PAD.south);
    expect(PAD_NAV.confirm).toContain(PAD.south);
    expect(PAD_NAV.back).toEqual([PAD.east]);
    expect(PAD_NAV.menu).toEqual([PAD.start]);
  });
  it('no pad = nothing held', () => {
    expect(gameplayOf(null)).toEqual({ steerX: 0, carve: false, jump: false, flip: false });
  });
});

describe('menu directions', () => {
  it('d-pad and stick both navigate; the dominant axis wins', () => {
    expect(navHeldOf(pad({ down: [PAD.down] })).down).toBe(true);
    expect(navHeldOf(pad({ axes: [0, -0.9, 0, 0] })).up).toBe(true);
    const diag = navHeldOf(pad({ axes: [0.7, 0.65, 0, 0] }));
    expect(diag.right).toBe(true);
    expect(diag.down).toBe(false);
    expect(navHeldOf(pad({ axes: [0.3, 0.3, 0, 0] }))).toEqual({ up: false, down: false, left: false, right: false });
  });
});

describe('repeat', () => {
  it('fires once, waits, then repeats steadily; releasing resets', () => {
    const r = new Repeater();
    expect(r.step({ down: true }, 0)).toEqual(['down']);
    expect(r.step({ down: true }, NAV_REPEAT_FIRST_MS - 1)).toEqual([]);
    expect(r.step({ down: true }, NAV_REPEAT_FIRST_MS)).toEqual(['down']);
    expect(r.step({ down: true }, NAV_REPEAT_FIRST_MS + NAV_REPEAT_MS - 1)).toEqual([]);
    expect(r.step({ down: true }, NAV_REPEAT_FIRST_MS + NAV_REPEAT_MS)).toEqual(['down']);
    expect(r.step({ down: false }, 2000)).toEqual([]);
    expect(r.step({ down: true }, 2001)).toEqual(['down']);
  });
});

describe('controller family from the browser id', () => {
  it.each([
    ['Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', 'xbox'],
    ['Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'xbox'],
    ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'playstation'],
    ['054c-09cc-Wireless Controller', 'playstation'],
    ['Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'switch'],
    ['Steam Deck Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)', 'steamdeck'],
    ['Some Cheap Pad', 'generic'],
  ])('%s -> %s', (id, fam) => { expect(familyOfId(id)).toBe(fam); });
});
