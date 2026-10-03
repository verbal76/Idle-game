import { describe, expect, it } from 'vitest';
import { SteerStrip } from './SteerStrip';
import { ActionButtons } from './ActionButtons';

// A DOM-free stand-in for an element: just what the input classes use.
function fakeEl(left: number, width: number) {
  const t = new EventTarget();
  const classes = new Set<string>();
  const props = new Map<string, string>();
  return Object.assign(t, {
    captured: new Set<number>(),
    classList: { toggle: (c: string, on: boolean) => { if (on) classes.add(c); else classes.delete(c); }, has: (c: string) => classes.has(c) },
    style: { setProperty: (k: string, v: string) => { props.set(k, v); } },
    props,
    dataset: {} as Record<string, string>,
    getBoundingClientRect: () => ({ left, width, right: left + width, top: 0, bottom: 80, height: 80 }),
    setPointerCapture(id: number) { this.captured.add(id); },
  });
}
type Fake = ReturnType<typeof fakeEl>;
const ev = (type: string, pointerId: number, clientX = 0) =>
  Object.assign(new Event(type), { pointerId, clientX });
const send = (el: Fake, type: string, id: number, x = 0) => el.dispatchEvent(ev(type, id, x));

// strip spans x = 100..400 (centre 250, half-width 150)
const X = (nx: number) => 250 + nx * 150;

function setup() {
  const strip = fakeEl(100, 300);
  const jump = fakeEl(500, 80);
  const flip = fakeEl(600, 60);
  const steer = new SteerStrip(strip as unknown as HTMLElement);
  const buttons = new ActionButtons(jump as unknown as HTMLElement, flip as unknown as HTMLElement);
  return { strip, jump, flip, steer, buttons };
}

describe('SteerStrip input', () => {
  it('is neutral until touched', () => {
    const { steer } = setup();
    expect(steer.left.x).toBe(0);
    expect(steer.upHeld).toBe(false);
  });

  it('touch-down anywhere maps straight to that steering strength', () => {
    const { strip, steer } = setup();
    send(strip, 'pointerdown', 1, X(-0.4));
    const mild = steer.left.x;
    expect(mild).toBeLessThan(0);
    expect(strip.captured.has(1)).toBe(true);
    send(strip, 'pointerup', 1);
    send(strip, 'pointerdown', 1, X(0.4));
    expect(steer.left.x).toBeCloseTo(-mild, 10);
    send(strip, 'pointerup', 1);
    send(strip, 'pointerdown', 1, X(0.97));
    expect(steer.left.x).toBe(1);
    expect(steer.upHeld).toBe(true);
  });

  it('dragging updates continuously: stronger, carve, back in, across centre', () => {
    const { strip, steer } = setup();
    send(strip, 'pointerdown', 1, X(0));
    const xs: number[] = [];
    for (const nx of [0.15, 0.3, 0.5]) { send(strip, 'pointermove', 1, X(nx)); xs.push(steer.left.x); }
    expect(xs[1]!).toBeGreaterThan(xs[0]!);
    expect(xs[2]!).toBeGreaterThan(xs[1]!);
    expect(steer.upHeld).toBe(false);
    send(strip, 'pointermove', 1, X(0.9)); expect(steer.upHeld).toBe(true);
    send(strip, 'pointermove', 1, X(0.72)); expect(steer.upHeld).toBe(true);   // hysteresis
    send(strip, 'pointermove', 1, X(0.5)); expect(steer.upHeld).toBe(false);
    send(strip, 'pointermove', 1, X(-0.3)); expect(steer.left.x).toBeLessThan(0);
    send(strip, 'pointermove', 1, X(-1.4)); // slid past the end: clamps
    expect(steer.left.x).toBe(-1); expect(steer.upHeld).toBe(true);
  });

  it('release, cancel and lost capture return to neutral and drop carve', () => {
    for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      const { strip, steer } = setup();
      send(strip, 'pointerdown', 7, X(0.95));
      expect(steer.upHeld).toBe(true);
      send(strip, end, 7);
      expect(steer.left.x).toBe(0);
      expect(steer.upHeld).toBe(false);
    }
  });

  it('reset() (pause / background / blur) clears everything', () => {
    const { strip, steer } = setup();
    send(strip, 'pointerdown', 1, X(-0.95));
    steer.reset();
    expect(steer.left.x).toBe(0); expect(steer.upHeld).toBe(false);
    send(strip, 'pointermove', 1, X(-0.95));   // a stray move after reset does nothing
    expect(steer.left.x).toBe(0);
  });

  it("another pointer's events don't steer or release; a new finger takes over", () => {
    const { strip, steer } = setup();
    send(strip, 'pointerdown', 1, X(0.5));
    const x = steer.left.x;
    send(strip, 'pointermove', 2, X(-0.9)); send(strip, 'pointerup', 2);
    expect(steer.left.x).toBe(x);
    send(strip, 'pointerdown', 3, X(-0.5));   // first finger's release was lost
    expect(steer.left.x).toBeLessThan(0);
    send(strip, 'pointerup', 1);               // stale pointer: ignored
    expect(steer.left.x).toBeLessThan(0);
  });

  it('steering + JUMP, carve + JUMP, and carve + FLIP all work at once', () => {
    const { strip, jump, flip, steer, buttons } = setup();
    send(strip, 'pointerdown', 1, X(0.5));
    send(jump, 'pointerdown', 2);
    expect(steer.left.x).toBeGreaterThan(0); expect(buttons.jumpHeld).toBe(true);
    send(strip, 'pointermove', 1, X(0.95));
    expect(steer.upHeld).toBe(true); expect(buttons.jumpHeld).toBe(true);
    send(flip, 'pointerdown', 3);
    expect(steer.upHeld).toBe(true); expect(buttons.flipHeld).toBe(true); expect(buttons.jumpHeld).toBe(true);
  });

  it("releasing the right thumb doesn't cancel steering; releasing steering doesn't cancel jump/flip", () => {
    const { strip, jump, flip, steer, buttons } = setup();
    send(strip, 'pointerdown', 1, X(-0.95));
    send(jump, 'pointerdown', 2); send(flip, 'pointerdown', 3);
    send(jump, 'pointerup', 2); send(flip, 'pointerup', 3);
    expect(buttons.jumpHeld).toBe(false); expect(buttons.flipHeld).toBe(false);
    expect(steer.left.x).toBe(-1); expect(steer.upHeld).toBe(true);
    send(jump, 'pointerdown', 2);
    send(strip, 'pointerup', 1);
    expect(steer.left.x).toBe(0); expect(steer.upHeld).toBe(false);
    expect(buttons.jumpHeld).toBe(true);
  });

  it('detach removes the listeners and leaves it neutral', () => {
    const { strip, steer } = setup();
    send(strip, 'pointerdown', 1, X(0.9));
    steer.detach();
    expect(steer.left.x).toBe(0);
    send(strip, 'pointerdown', 1, X(0.9));
    expect(steer.left.x).toBe(0);
  });
});
