export interface StickValue { x: number; y: number }

type Bound = {
  el: HTMLElement;
  onDown: (e: PointerEvent) => void;
  onMove: (e: PointerEvent) => void;
  onUp: (e: PointerEvent) => void;
};

export class TwinStickInput {
  readonly left: StickValue = { x: 0, y: 0 };
  readonly right: StickValue = { x: 0, y: 0 };
  private bindings: Bound[] = [];

  // rightEl is optional now — the action buttons (jump/flip) live where the
  // right stick used to be, so most modes only wire a left stick.
  constructor(leftEl: HTMLElement, rightEl?: HTMLElement) {
    this.bindings.push(this.bind(leftEl, this.left));
    if (rightEl) this.bindings.push(this.bind(rightEl, this.right));
  }

  detach(): void {
    for (const b of this.bindings) {
      b.el.removeEventListener('pointerdown', b.onDown);
      b.el.removeEventListener('pointermove', b.onMove);
      b.el.removeEventListener('pointerup', b.onUp);
      b.el.removeEventListener('pointercancel', b.onUp);
    }
    this.bindings = [];
  }

  private bind(el: HTMLElement, target: StickValue): Bound {
    const knob = el.querySelector<HTMLElement>('.knob')!;
    let pointerId: number | null = null;
    let cx = 0, cy = 0, radius = 1;

    const onDown = (e: PointerEvent) => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      radius = r.width / 2;
      onMove(e);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const k = dist > 0 ? Math.min(dist, radius) / dist : 0;
      const nx = dx * k;
      const ny = dy * k;
      knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
      target.x = nx / radius;
      target.y = -ny / radius;
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      knob.style.transform = `translate(-50%, -50%)`;
      target.x = 0;
      target.y = 0;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    return { el, onDown, onMove, onUp };
  }
}
