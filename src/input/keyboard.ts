import { KEY_GAMEPLAY, KEY_PAUSE, KEY_STEER_LEFT, KEY_STEER_RIGHT, type GameplayAction, type NavAction } from './actions';
import { DIGITAL_NX } from './gamepad';
import { steerFromPosition } from './steerMap';
import type { HubEvent } from './hub';

/** What the keyboard source needs from an event (KeyboardEvent-shaped, DOM-free for tests). */
export interface KeyLike {
  code: string;
  repeat?: boolean;
  target?: unknown;
  preventDefault?(): void;
}
export type KeyTarget = EventTarget;
const asListener = (fn: (e: KeyLike) => void): EventListener => fn as unknown as EventListener;

const NAV_KEYS: Record<string, NavAction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};

const isTextField = (t: unknown): boolean => {
  const el = t as { tagName?: string; type?: string; isContentEditable?: boolean } | null;
  if (!el || typeof el.tagName !== 'string') return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'submit'].includes(el.type ?? 'text');
};

/**
 * Keyboard as the third source for the same actions. In a run it is held
 * state (like the touch controls); in menus it only reports navigation
 * (arrows / WASD move focus, Escape = back, P = Start). Enter and Space on a
 * focused control are left to the browser. Typing in a text field is never
 * intercepted.
 */
export class KeyboardSource {
  private readonly down = new Set<string>();
  private readonly suppressed = new Set<GameplayAction>();
  private readonly listeners = new Set<(e: HubEvent) => void>();
  /** Whether a run is taking gameplay keys (set by the run). */
  playing: () => boolean = () => false;
  private readonly onDown = (e: KeyLike) => {
    if (isTextField(e.target)) return;
    const first = !this.down.has(e.code);
    this.down.add(e.code);
    if (!e.repeat && first) this.emit({ type: 'activity', source: 'keyboard' });
    if (this.playing()) {
      // Space would also press a focused button; the run owns it.
      if (KEY_GAMEPLAY.jump.includes(e.code) || NAV_KEYS[e.code]) e.preventDefault?.();
    }
    if (e.repeat && !NAV_KEYS[e.code]) return;
    if (KEY_PAUSE.includes(e.code)) {
      if (!first && !e.repeat) return;
      if (e.code === 'Escape') this.emit({ type: 'nav', action: 'back' });
      else this.emit({ type: 'nav', action: 'menu' });
      return;
    }
    const nav = NAV_KEYS[e.code];
    if (nav && !this.playing()) { e.preventDefault?.(); this.emit({ type: 'nav', action: nav }); }
  };
  private readonly onUp = (e: KeyLike) => {
    this.down.delete(e.code);
    // A suppressed action re-arms as soon as none of its keys is down.
    for (const a of [...this.suppressed]) if (!this.anyDown(KEY_GAMEPLAY[a])) this.suppressed.delete(a);
  };
  private readonly onBlur = () => { this.down.clear(); };

  constructor(private readonly target: KeyTarget) {
    target.addEventListener('keydown', asListener(this.onDown));
    target.addEventListener('keyup', asListener(this.onUp));
    target.addEventListener('blur', this.onBlur);
  }

  on(l: (e: HubEvent) => void): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  private emit(e: HubEvent): void { for (const l of [...this.listeners]) l(e); }

  private anyDown(codes: readonly string[]): boolean { return codes.some((c) => this.down.has(c)); }

  /** Keys held when the run took over are ignored until released (like the pad). */
  releaseAll(): void {
    for (const a of Object.keys(KEY_GAMEPLAY) as GameplayAction[]) if (this.anyDown(KEY_GAMEPLAY[a])) this.suppressed.add(a);
  }

  held(a: GameplayAction): boolean {
    const h = this.anyDown(KEY_GAMEPLAY[a]);
    if (!h) this.suppressed.delete(a);
    return h && !this.suppressed.has(a);
  }

  get steerX(): number {
    const nx = ((this.anyDown(KEY_STEER_RIGHT) ? 1 : 0) - (this.anyDown(KEY_STEER_LEFT) ? 1 : 0)) * DIGITAL_NX;
    return steerFromPosition(nx, false).x;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', asListener(this.onDown));
    this.target.removeEventListener('keyup', asListener(this.onUp));
    this.target.removeEventListener('blur', this.onBlur);
    this.down.clear();
  }
}
