import { PAD_GAMEPLAY, type GameplayAction, type NavAction } from './actions';
import { Repeater, familyOfId, gameplayOf, navHeldOf, pressedNavButtons, type PadFamily, type PadGameplay, type PadSnapshot } from './gamepad';

export type InputSource = 'touch' | 'keyboard' | 'gamepad';

export type HubEvent =
  | { type: 'connect'; id: string; family: PadFamily }
  | { type: 'disconnect' }
  | { type: 'nav'; action: NavAction }
  | { type: 'activity'; source: InputSource };
export type HubListener = (e: HubEvent) => void;

export interface HubOptions {
  /** Raw pads (null for empty slots), as navigator.getGamepads() returns them. */
  getPads?: () => ReadonlyArray<PadSnapshot | null>;
  now?: () => number;
}

/** Converts a browser Gamepad to a snapshot; only the standard mapping is used. */
export function snapshotOf(g: Gamepad | null): PadSnapshot | null {
  if (!g || !g.connected || g.mapping !== 'standard') return null;
  return { id: g.id, axes: Array.from(g.axes), buttons: Array.from(g.buttons, (b) => b.pressed || b.value > 0.5) };
}

const defaultPads = (): ReadonlyArray<PadSnapshot | null> => {
  try { return Array.from(navigator.getGamepads?.() ?? [], snapshotOf); } catch { return []; }
};

/**
 * Polls the gamepad once per frame and turns it into (a) held gameplay
 * state for the run and (b) edge-triggered menu navigation events. It owns
 * hot connect / disconnect. It knows nothing about screens: the navigation
 * controller and the run decide what the events mean.
 */
export class InputHub {
  private readonly getPads: () => ReadonlyArray<PadSnapshot | null>;
  private readonly now: () => number;
  private listeners = new Set<HubListener>();
  private pad: PadSnapshot | null = null;
  private padIndex = -1;
  private prev: PadSnapshot | null = null;
  private readonly repeater = new Repeater();
  /** Gameplay buttons that were already down when the run (or an overlay) took over: ignored until released. */
  private readonly suppressed = new Set<GameplayAction>();
  private lastGameplay: PadGameplay = { steerX: 0, carve: false, jump: false, flip: false };
  private timer: number | null = null;

  constructor(opts: HubOptions = {}) {
    this.getPads = opts.getPads ?? defaultPads;
    this.now = opts.now ?? (() => performance.now());
  }

  on(l: HubListener): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
  private emit(e: HubEvent): void { for (const l of [...this.listeners]) l(e); }

  get connected(): boolean { return this.pad !== null; }
  get family(): PadFamily { return this.pad ? familyOfId(this.pad.id) : 'generic'; }
  /** Effective gameplay input this frame (suppression applied). */
  get gameplay(): PadGameplay { return this.lastGameplay; }

  /**
   * Treat every gameplay button that is down right now as not pressed until
   * it is released. Called whenever the run starts taking input again
   * (run start, resume, closing an overlay): the A press that chose "Resume"
   * must not also start a jump charge.
   */
  releaseAll(): void {
    for (const a of Object.keys(PAD_GAMEPLAY) as GameplayAction[]) {
      if (this.rawHeld(a)) this.suppressed.add(a);
    }
    this.recompute();
  }

  private rawHeld(a: GameplayAction): boolean {
    return !!this.pad && PAD_GAMEPLAY[a].some((i) => this.pad!.buttons[i] === true);
  }

  private recompute(): void {
    const g = gameplayOf(this.pad);
    for (const a of [...this.suppressed]) if (!g[a]) this.suppressed.delete(a);
    this.lastGameplay = {
      steerX: g.steerX,
      carve: g.carve && !this.suppressed.has('carve'),
      jump: g.jump && !this.suppressed.has('jump'),
      flip: g.flip && !this.suppressed.has('flip'),
    };
  }

  /** Reads the pads once. Called every frame by start(); tests call it directly. */
  poll(): void {
    const pads = this.getPads();
    // Stay on the current pad while it is present; otherwise take the first.
    let idx = this.padIndex >= 0 && pads[this.padIndex] ? this.padIndex : pads.findIndex((p) => p !== null);
    // A different pad that is being used takes over (hot swap between pads).
    pads.forEach((p, i) => { if (p && i !== idx && this.isActive(p, null)) idx = i; });
    const next = idx >= 0 ? pads[idx] : null;

    if (!next && this.pad) {
      this.pad = null; this.prev = null; this.padIndex = -1;
      this.repeater.reset(); this.suppressed.clear();
      this.recompute();
      this.emit({ type: 'disconnect' });
      return;
    }
    if (!next) return;

    const changed = idx !== this.padIndex || this.pad?.id !== next.id;
    if (changed) {
      this.padIndex = idx; this.prev = null; this.repeater.reset();
      this.pad = next;
      this.emit({ type: 'connect', id: next.id, family: familyOfId(next.id) });
      // Whatever is held at connect time is not an intentional press.
      this.suppressed.clear();
      for (const a of Object.keys(PAD_GAMEPLAY) as GameplayAction[]) if (this.rawHeld(a)) this.suppressed.add(a);
    }
    const before = this.prev;
    this.pad = next;
    this.recompute();

    if (this.isActive(next, before)) this.emit({ type: 'activity', source: 'gamepad' });

    // Menu navigation: edges for buttons, repeat for held directions.
    const nav = pressedNavButtons(next);
    // The first frame of a pad is a baseline: the press that woke it is not a menu action.
    const navPrev = pressedNavButtons(before ?? next);
    for (const a of ['confirm', 'back', 'menu'] as const) {
      if (nav[a] && !navPrev[a]) this.emit({ type: 'nav', action: a });
    }
    for (const d of this.repeater.step(navHeldOf(next), this.now())) this.emit({ type: 'nav', action: d as NavAction });
    this.prev = next;
  }

  private isActive(p: PadSnapshot, before: PadSnapshot | null): boolean {
    if (!before) return p.buttons.some(Boolean) || Math.hypot(p.axes[0] ?? 0, p.axes[1] ?? 0) > 0.5;
    if (p.buttons.some((b, i) => b !== before.buttons[i])) return true;
    return Math.hypot(p.axes[0] ?? 0, p.axes[1] ?? 0) > 0.5;
  }

  /** Begins polling every animation frame (a no-op if already running). */
  start(): void {
    if (this.timer !== null || typeof requestAnimationFrame === 'undefined') return;
    const loop = () => { this.poll(); this.timer = requestAnimationFrame(loop); };
    this.timer = requestAnimationFrame(loop);
  }
  stop(): void {
    if (this.timer !== null) cancelAnimationFrame(this.timer);
    this.timer = null;
  }
}
