import { clampNx, steerFromPosition } from './steerMap';

export interface StickValue { x: number; y: number }

/**
 * The steering strip (left thumb): one horizontal control that replaces the
 * LEFT / RIGHT / CARVE buttons. Touch anywhere on it; the horizontal
 * position is the steering strength (see steerMap.ts) and the outer ends are
 * carve. Sliding keeps updating it, also past the ends (pointer capture).
 *
 * Release, cancel, lost capture and reset() (pause, backgrounding, focus
 * loss) return it to neutral, so steering or carve can't stay stuck. A new
 * finger on the strip takes it over from a lost one. It never touches the
 * JUMP / FLIP buttons, each of which tracks its own pointer.
 */
export class SteerStrip {
  readonly left: StickValue = { x: 0, y: 0 };
  /** Carve engaged (the outer zone). */
  upHeld = false;
  private activeId: number | null = null;
  private readonly onDown: (e: PointerEvent) => void;
  private readonly onMove: (e: PointerEvent) => void;
  private readonly onEnd: (e: PointerEvent) => void;

  constructor(private readonly el: HTMLElement) {
    this.onDown = (e) => {
      try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      this.activeId = e.pointerId;
      this.update(e.clientX);
    };
    this.onMove = (e) => { if (e.pointerId === this.activeId) this.update(e.clientX); };
    this.onEnd = (e) => { if (e.pointerId === this.activeId) this.reset(); };
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onEnd);
    el.addEventListener('pointercancel', this.onEnd);
    el.addEventListener('lostpointercapture', this.onEnd);
    this.paint(0, false, false);
  }

  /** Neutral: nothing held (pause, backgrounding, focus loss, release). */
  reset(): void {
    this.activeId = null;
    this.left.x = 0;
    this.upHeld = false;
    this.paint(0, false, false);
  }

  detach(): void {
    const el = this.el;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onEnd);
    el.removeEventListener('pointercancel', this.onEnd);
    el.removeEventListener('lostpointercapture', this.onEnd);
    this.reset();
  }

  private update(clientX: number): void {
    const r = this.el.getBoundingClientRect();
    const half = r.width / 2;
    const nx = half > 0 ? clampNx((clientX - (r.left + half)) / half) : 0;
    const out = steerFromPosition(nx, this.upHeld);
    this.left.x = out.x;
    this.upHeld = out.carve;
    this.paint(nx, out.carve, true);
  }

  private paint(nx: number, carve: boolean, touching: boolean): void {
    const s = this.el.style;
    s.setProperty('--nx', nx.toFixed(3));
    s.setProperty('--amt', Math.abs(this.left.x).toFixed(3));
    this.el.classList.toggle('pressed', touching);
    this.el.classList.toggle('carving', carve);
    this.el.dataset.side = carve || Math.abs(this.left.x) > 0 ? (nx < 0 ? 'left' : 'right') : '';
  }
}
