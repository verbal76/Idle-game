import { bindHold, type HoldBinding } from './holdButton';

export interface StickValue { x: number; y: number }

/**
 * The steering pad: LEFT / RIGHT drive left.x = ±1, and the Deep carve
 * button sets upHeld. A thumb that slides from one arrow onto the other
 * switches direction without lifting (pointer capture would otherwise
 * keep reporting the first arrow).
 */
export class ArrowPadInput {
  readonly left: StickValue = { x: 0, y: 0 };
  upHeld = false;
  private leftHeld = false;
  private rightHeld = false;
  private bindings: HoldBinding[];
  private readonly onMove: (e: PointerEvent) => void;

  constructor(private readonly leftEl: HTMLElement, private readonly rightEl: HTMLElement, upEl?: HTMLElement) {
    const l = bindHold(leftEl, (h) => { this.leftHeld = h; this.recompute(); });
    const r = bindHold(rightEl, (h) => { this.rightHeld = h; this.recompute(); });
    this.bindings = [l, r];
    if (upEl) this.bindings.push(bindHold(upEl, (h) => { this.upHeld = h; }));
    // Slide between arrows: the moving pointer belongs to whichever
    // arrow it is over.
    this.onMove = (e: PointerEvent) => {
      const from = e.pointerId === l.pointerId ? l : e.pointerId === r.pointerId ? r : null;
      if (!from) return;
      const toEl = from === l ? this.rightEl : this.leftEl;
      const b = toEl.getBoundingClientRect();
      if (e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom) {
        // Hand the pointer over: the other arrow captures it.
        from.release();
        toEl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: e.pointerId, bubbles: false }));
      }
    };
    leftEl.addEventListener('pointermove', this.onMove);
    rightEl.addEventListener('pointermove', this.onMove);
  }

  /** Releases every button (pause, backgrounding, focus loss). */
  reset(): void { for (const b of this.bindings) b.release(); }

  detach(): void {
    this.leftEl.removeEventListener('pointermove', this.onMove);
    this.rightEl.removeEventListener('pointermove', this.onMove);
    for (const b of this.bindings) b.detach();
  }

  private recompute(): void {
    this.left.x = (this.rightHeld ? 1 : 0) - (this.leftHeld ? 1 : 0);
  }
}
