import { PAD, PAD_AXIS, PAD_GAMEPLAY, PAD_NAV, type GameplayAction, type NavAction } from './actions';
import { steerFromPosition } from './steerMap';

/** A pad as the rest of the game sees it (a plain snapshot, testable without a browser). */
export interface PadSnapshot {
  id: string;
  axes: readonly number[];
  buttons: readonly boolean[];
}

/** Radial dead zone for the stick (drift): below this the stick reads 0. */
export const STICK_DEAD = 0.14;
/**
 * A full stick throw maps to this position on the steering strip, which is
 * past "full steering" (0.62) but short of the carve zone (0.8): the stick
 * steers exactly like a thumb on the strip, and carve is its own button, so
 * the stick never carves by accident.
 */
export const STICK_MAX_NX = 0.75;
/** A d-pad / keyboard direction steers like a thumb on the strip at this position. */
export const DIGITAL_NX = 0.75;
/** Menu stick navigation: threshold and repeat timing. */
export const NAV_STICK = 0.6;
export const NAV_REPEAT_FIRST_MS = 380;
export const NAV_REPEAT_MS = 130;

const clean = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Left-stick X after dead zone, rescaled to a strip position -STICK_MAX_NX..STICK_MAX_NX. */
export function stickToNx(ax: number, ay: number): number {
  const x = clean(ax), y = clean(ay);
  const mag = Math.hypot(x, y);
  if (mag < STICK_DEAD) return 0;
  const scaled = Math.min(1, (mag - STICK_DEAD) / (1 - STICK_DEAD));
  // Keep the horizontal component of the direction, so pushing up/down alone never steers.
  const dirX = x / mag;
  return dirX * scaled * STICK_MAX_NX;
}

export interface PadGameplay {
  /** -1..1, same scale and curve as the touch strip. */
  steerX: number;
  carve: boolean;
  jump: boolean;
  flip: boolean;
}

export function gameplayOf(p: PadSnapshot | null): PadGameplay {
  if (!p) return { steerX: 0, carve: false, jump: false, flip: false };
  const held = (a: GameplayAction) => PAD_GAMEPLAY[a].some((i) => p.buttons[i] === true);
  let nx = stickToNx(p.axes[PAD_AXIS.lx], p.axes[PAD_AXIS.ly]);
  if (nx === 0) {
    // The d-pad steers too (both pressed cancel).
    nx = ((p.buttons[PAD.right] ? 1 : 0) - (p.buttons[PAD.left] ? 1 : 0)) * DIGITAL_NX;
  }
  const s = steerFromPosition(nx, false);
  return { steerX: s.x, carve: held('carve'), jump: held('jump'), flip: held('flip') };
}

/** Which menu directions the pad is asking for right now (stick or d-pad). */
export function navHeldOf(p: PadSnapshot | null): Record<'up' | 'down' | 'left' | 'right', boolean> {
  const none = { up: false, down: false, left: false, right: false };
  if (!p) return none;
  const lx = clean(p.axes[PAD_AXIS.lx]), ly = clean(p.axes[PAD_AXIS.ly]);
  // The dominant axis wins so a diagonal flick moves one way.
  const horiz = Math.abs(lx) >= Math.abs(ly);
  return {
    up: p.buttons[PAD.up] === true || (!horiz && ly <= -NAV_STICK),
    down: p.buttons[PAD.down] === true || (!horiz && ly >= NAV_STICK),
    left: p.buttons[PAD.left] === true || (horiz && lx <= -NAV_STICK),
    right: p.buttons[PAD.right] === true || (horiz && lx >= NAV_STICK),
  };
}

export function pressedNavButtons(p: PadSnapshot | null): Record<'confirm' | 'back' | 'menu', boolean> {
  const pick = (a: NavAction) => !!p && PAD_NAV[a].some((i) => p.buttons[i] === true);
  return { confirm: pick('confirm'), back: pick('back'), menu: pick('menu') };
}

/** Pad family for prompt glyphs, from the browser's Gamepad.id string. */
export type PadFamily = 'xbox' | 'playstation' | 'switch' | 'steamdeck' | 'generic';
export function familyOfId(id: string): PadFamily {
  const s = id.toLowerCase();
  // Steam Deck / Steam Controller report Valve's vendor id (28de).
  if (/28de|steam deck|steam controller|valve/.test(s)) return 'steamdeck';
  if (/054c|dualsense|dualshock|playstation|ps[345] controller|sony/.test(s)) return 'playstation';
  if (/057e|nintendo|switch|joy-?con|pro controller/.test(s)) return 'switch';
  if (/045e|xbox|xinput|microsoft/.test(s)) return 'xbox';
  return 'generic';
}

/** A digital press→action repeater for held menu directions (first delay, then a steady rate). */
export class Repeater {
  private since = new Map<string, number>();
  private last = new Map<string, number>();
  /** Returns the directions that should fire now. */
  step(held: Record<string, boolean>, now: number): string[] {
    const fire: string[] = [];
    for (const k of Object.keys(held)) {
      if (!held[k]) { this.since.delete(k); this.last.delete(k); continue; }
      const t0 = this.since.get(k);
      if (t0 === undefined) { this.since.set(k, now); this.last.set(k, now); fire.push(k); continue; }
      const sinceLast = now - (this.last.get(k) ?? now);
      const need = this.last.get(k) === t0 ? NAV_REPEAT_FIRST_MS : NAV_REPEAT_MS;
      if (sinceLast >= need) { this.last.set(k, now); fire.push(k); }
    }
    return fire;
  }
  reset(): void { this.since.clear(); this.last.clear(); }
}
