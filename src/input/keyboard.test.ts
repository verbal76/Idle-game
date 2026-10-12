import { describe, expect, it } from 'vitest';
import { KeyboardSource } from './keyboard';
import { steerFromPosition } from './steerMap';
import { DIGITAL_NX } from './gamepad';
import type { HubEvent } from './hub';

/** A plain target that hands the handlers plain event objects (so `target` can be set). */
class FakeTarget extends EventTarget {
  private map = new Map<string, Array<(e: unknown) => void>>();
  override addEventListener(type: string, fn: EventListenerOrEventListenerObject | null): void {
    if (typeof fn === 'function') this.map.set(type, [...(this.map.get(type) ?? []), fn as (e: unknown) => void]);
  }
  override removeEventListener(type: string, fn: EventListenerOrEventListenerObject | null): void {
    this.map.set(type, (this.map.get(type) ?? []).filter((f) => f !== fn));
  }
  fire(type: string, e: object = {}): void { for (const f of this.map.get(type) ?? []) f(e); }
}

function rig(playing = false) {
  const t = new FakeTarget();
  const kb = new KeyboardSource(t);
  kb.playing = () => playing;
  const events: HubEvent[] = [];
  kb.on((e) => events.push(e));
  let prevented = 0;
  const key = (type: 'keydown' | 'keyup', code: string, extra: object = {}) =>
    t.fire(type, { code, repeat: false, preventDefault: () => { prevented++; }, ...extra });
  return { kb, t, events, key, prevented: () => prevented, navs: () => events.filter((e) => e.type === 'nav').map((e) => (e as { action: string }).action) };
}

describe('keyboard = the same actions', () => {
  it('Space jumps, F flips, Shift or Up carves, arrows / A D steer', () => {
    const r = rig(true);
    r.key('keydown', 'Space'); r.key('keydown', 'KeyF'); r.key('keydown', 'ShiftLeft'); r.key('keydown', 'ArrowRight');
    expect([r.kb.held('jump'), r.kb.held('flip'), r.kb.held('carve')]).toEqual([true, true, true]);
    expect(r.kb.steerX).toBe(steerFromPosition(DIGITAL_NX, false).x);
    r.key('keyup', 'ArrowRight'); r.key('keydown', 'KeyA');
    expect(r.kb.steerX).toBeLessThan(0);
    r.key('keydown', 'KeyD');
    expect(r.kb.steerX).toBe(0);
  });
  it('releasing a key releases the action; blur releases everything', () => {
    const r = rig(true);
    r.key('keydown', 'Space');
    r.key('keyup', 'Space');
    expect(r.kb.held('jump')).toBe(false);
    r.key('keydown', 'Space');
    r.t.fire('blur');
    expect(r.kb.held('jump')).toBe(false);
  });
  it('a key still down when the run takes over is ignored until released', () => {
    const r = rig(true);
    r.key('keydown', 'Space');
    r.kb.releaseAll();
    expect(r.kb.held('jump')).toBe(false);
    r.key('keyup', 'Space'); r.key('keydown', 'Space');
    expect(r.kb.held('jump')).toBe(true);
  });
  it('in a run Space is the run’s (it must not also press a focused button)', () => {
    const r = rig(true);
    r.key('keydown', 'Space');
    expect(r.prevented()).toBeGreaterThan(0);
  });
});

describe('keyboard in menus', () => {
  it('arrows / WASD navigate, Escape = back, P = menu, and repeat keeps navigating', () => {
    const r = rig(false);
    r.key('keydown', 'ArrowDown'); r.key('keyup', 'ArrowDown');
    r.key('keydown', 'KeyW'); r.key('keyup', 'KeyW');
    r.key('keydown', 'ArrowDown', { repeat: true });
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape');
    r.key('keydown', 'KeyP');
    expect(r.navs()).toEqual(['down', 'up', 'down', 'back', 'menu']);
  });
  it('does not touch Enter or Space (the browser presses the focused button)', () => {
    const r = rig(false);
    r.key('keydown', 'Enter'); r.key('keydown', 'Space');
    expect(r.navs()).toEqual([]);
    expect(r.prevented()).toBe(0);
  });
  it('never intercepts typing in a text field', () => {
    const r = rig(false);
    r.key('keydown', 'KeyA', { target: { tagName: 'INPUT', type: 'text' } });
    r.key('keydown', 'ArrowLeft', { target: { tagName: 'INPUT' } });
    r.key('keydown', 'Escape', { target: { tagName: 'TEXTAREA' } });
    expect(r.events).toEqual([]);
    // Sliders are not text: arrows still navigate there.
    r.key('keydown', 'ArrowDown', { target: { tagName: 'INPUT', type: 'range' } });
    expect(r.navs()).toEqual(['down']);
  });
  it('keyboard activity is reported once per press, not per repeat', () => {
    const r = rig(false);
    r.key('keydown', 'KeyZ'); r.key('keydown', 'KeyZ', { repeat: true });
    expect(r.events.filter((e) => e.type === 'activity')).toHaveLength(1);
  });
});
