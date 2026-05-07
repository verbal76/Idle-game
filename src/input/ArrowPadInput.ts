export interface StickValue { x: number; y: number }

type Side = 'left' | 'right';
interface Bound {
  el: HTMLElement;
  onDown: (e: PointerEvent) => void;
  onUp:   (e: PointerEvent) => void;
}

/**
 * Two-button D-pad replacement for the analog stick. Holding LEFT sets
 * left.x = -1, holding RIGHT sets left.x = +1, otherwise 0. Conforms to
 * the same .left.x contract Game reads via the leftStick() callback so
 * the rest of the game doesn't change.
 */
export class ArrowPadInput {
  readonly left: StickValue = { x: 0, y: 0 };
  readonly right: StickValue = { x: 0, y: 0 };
  private leftHeld = false;
  private rightHeld = false;
  private bindings: Bound[] = [];

  constructor(leftEl: HTMLElement, rightEl: HTMLElement) {
    this.bindings.push(this.bind(leftEl, 'left'));
    this.bindings.push(this.bind(rightEl, 'right'));
  }

  detach(): void {
    for (const b of this.bindings) {
      b.el.removeEventListener('pointerdown', b.onDown);
      b.el.removeEventListener('pointerup', b.onUp);
      b.el.removeEventListener('pointercancel', b.onUp);
      b.el.removeEventListener('pointerleave', b.onUp);
    }
    this.bindings = [];
  }

  private bind(el: HTMLElement, side: Side): Bound {
    let activeId: number | null = null;
    const onDown = (e: PointerEvent) => {
      if (activeId !== null) return;
      activeId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add('pressed');
      if (side === 'left') this.leftHeld = true; else this.rightHeld = true;
      this.recompute();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      el.classList.remove('pressed');
      if (side === 'left') this.leftHeld = false; else this.rightHeld = false;
      this.recompute();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);
    return { el, onDown, onUp };
  }

  private recompute(): void {
    this.left.x = (this.rightHeld ? 1 : 0) - (this.leftHeld ? 1 : 0);
  }
}
