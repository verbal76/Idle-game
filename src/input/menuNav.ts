import type { NavAction } from './actions';

export interface Box { left: number; top: number; right: number; bottom: number }
export type Dir = 'up' | 'down' | 'left' | 'right';

const cx = (b: Box) => (b.left + b.right) / 2;
const cy = (b: Box) => (b.top + b.bottom) / 2;

/**
 * Spatial focus move: the nearest box in the pressed direction, preferring
 * ones lined up with the current box. Up/down wrap (a vertical list never
 * dead-ends); left/right do not. Returns null when nothing lies that way.
 */
export function pickNext(boxes: readonly Box[], current: number, dir: Dir): number | null {
  if (boxes.length === 0) return null;
  if (current < 0 || current >= boxes.length) return 0;
  const c = boxes[current];
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'down' || dir === 'right' ? 1 : -1;
  let best = -1;
  let bestScore = Infinity;
  boxes.forEach((b, i) => {
    if (i === current) return;
    const along = horizontal ? (cx(b) - cx(c)) * sign : (cy(b) - cy(c)) * sign;
    if (along <= 1) return;
    const across = Math.abs(horizontal ? cy(b) - cy(c) : cx(b) - cx(c));
    // Boxes that overlap the current one across the axis are "in line".
    const overlap = horizontal
      ? Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top) > 0
      : Math.min(b.right, c.right) - Math.max(b.left, c.left) > 0;
    const score = along + across * (overlap ? 0.5 : 3);
    if (score < bestScore) { bestScore = score; best = i; }
  });
  if (best >= 0) return best;
  if (!horizontal) {
    // Wrap to the far row (opposite the press), nearest across within it.
    let far = -1;
    let farAlong = Infinity;
    let farAcross = Infinity;
    boxes.forEach((b, i) => {
      if (i === current) return;
      const along = cy(b) * sign;
      const across = Math.abs(cx(b) - cx(c));
      if (along < farAlong - 1 || (Math.abs(along - farAlong) <= 1 && across < farAcross)) { far = i; farAlong = along; farAcross = across; }
    });
    return far >= 0 ? far : null;
  }
  return null;
}

const FOCUSABLE = 'button, [role="button"], input[type="range"], input[type="checkbox"], input:not([type]), input[type="text"], a[href], select, [tabindex]:not([tabindex="-1"])';
const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0 && !(el as HTMLButtonElement).disabled;

/** The topmost screen/overlay currently on top, or null when only the HUD is showing. */
export function topLayer(doc: Document): HTMLElement | null {
  const panels = [...doc.querySelectorAll<HTMLElement>('.fullscreen-panel')].filter(visible);
  for (let i = panels.length - 1; i >= 0; i--) {
    if ([...panels[i].querySelectorAll(FOCUSABLE)].some(visible)) return panels[i];
  }
  return null;
}

export interface MenuNavOptions {
  doc?: Document;
  /** A run is riding with no overlay: directions don't move focus. */
  inPlay: () => boolean;
  /** Back (East / Esc): returns true if something consumed it. */
  back: () => boolean;
  /** Start / Menu: pause or resume in a run. Returns true if consumed. */
  menu: () => boolean;
}

/**
 * Drives the existing DOM menus from navigation actions: moves focus, presses
 * the focused control, adjusts sliders, and keeps a visible focus ring. It
 * never changes what a control does: confirm is a normal click(), back is the
 * same Back the Android button uses.
 */
export class MenuNav {
  private readonly doc: Document;
  private visibleRing = false;
  private observer: MutationObserver | null = null;

  constructor(private readonly o: MenuNavOptions) {
    this.doc = o.doc ?? document;
  }

  /** Start repairing focus when a screen changes under a pad/keyboard user. */
  attach(): void {
    if (this.observer || typeof MutationObserver === 'undefined') return;
    this.observer = new MutationObserver(() => this.repair());
    this.observer.observe(this.doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    this.doc.addEventListener('pointerdown', () => this.showRing(false), true);
  }
  detach(): void { this.observer?.disconnect(); this.observer = null; }

  /** The focus ring only shows for pad/keyboard users, never for touch. */
  showRing(on: boolean): void {
    this.visibleRing = on;
    this.doc.documentElement.classList.toggle('nav-ring', on);
    if (on) this.repair();
  }

  private blocked(): boolean {
    return !!this.doc.querySelector('#studio-splash:not(.out), .applying-update');
  }

  private items(layer: HTMLElement): HTMLElement[] {
    return [...layer.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
  }

  /** Make sure focus sits on something real in the top layer (focus lost, screen swapped, ...). */
  repair(): void {
    if (!this.visibleRing || this.o.inPlay() || this.blocked()) return;
    const layer = topLayer(this.doc);
    if (!layer) return;
    const a = this.doc.activeElement as HTMLElement | null;
    if (a && layer.contains(a) && visible(a) && a !== this.doc.body) return;
    const items = this.items(layer);
    if (items.length === 0) return;
    const pick = items.find((e) => e.matches('[data-nav-default]')) ?? items.find((e) => e.matches('.btn-go, .btn-play, .primary')) ?? items.find((e) => !e.hasAttribute('data-back')) ?? items[0];
    pick.focus({ preventScroll: false });
  }

  handle(action: NavAction): void {
    if (this.blocked()) return;
    const inPlay = this.o.inPlay();
    if (action === 'back') { this.o.back(); return; }
    if (action === 'menu') { this.o.menu(); return; }
    if (inPlay) return;
    const layer = topLayer(this.doc);
    if (!layer) { this.showRing(true); return; }
    const items = this.items(layer);
    const active = this.doc.activeElement as HTMLElement | null;
    const wasOnItem = !!active && items.includes(active);
    const ringWasOff = !this.visibleRing;
    this.showRing(true);
    // Focus was lost or never set: this press only places it, it never moves or presses anything.
    if (!wasOnItem) return;
    // Likewise a confirm that only brought the focus ring back.
    if (ringWasOff && action === 'confirm') return;
    const el = this.doc.activeElement as HTMLElement | null;
    if (!el || !items.includes(el)) return;

    if (action === 'confirm') {
      if (el instanceof HTMLInputElement && el.type === 'range') return;     // sliders adjust with left/right
      el.click();
      return;
    }
    if ((action === 'left' || action === 'right') && el instanceof HTMLInputElement && el.type === 'range') {
      const step = Number(el.step) || 1;
      const delta = (action === 'right' ? 1 : -1) * Math.max(step, Math.round((Number(el.max) - Number(el.min)) / 20));
      const next = Math.max(Number(el.min), Math.min(Number(el.max), Number(el.value) + delta));
      if (String(next) !== el.value) {
        el.value = String(next);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    const boxes = items.map((e) => e.getBoundingClientRect());
    const idx = pickNext(boxes, items.indexOf(el), action as Dir);
    if (idx !== null && idx !== items.indexOf(el)) {
      items[idx].focus();
      items[idx].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } else if (action === 'up' || action === 'down') {
      // Nothing to move to (a long read-only page): scroll it instead.
      const scroller = (el.closest('.fullscreen-panel') as HTMLElement | null) ?? layer;
      scroller.scrollBy?.({ top: action === 'down' ? 120 : -120 });
    }
  }
}
