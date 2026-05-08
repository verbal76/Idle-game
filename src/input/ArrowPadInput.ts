export interface StickValue { x: number; y: number }

type Side = 'left' | 'right' | 'up';
interface Bound {
  el: HTMLElement;
  onDown: (e: PointerEvent) => void;
  onUp:   (e: PointerEvent) => void;
}

/**
 * Three-button D-pad replacement for the analog stick. LEFT/RIGHT drive
 * left.x = ±1 same as before; UP is exposed as a separate `upHeld` flag
 * for callers that want a "pull out of a turn" shortcut without coupling
 * it to the stick value (the carve / spin code still reads stick-X to
 * decide direction, and folding UP into stick-Y would break that).
 */
export class ArrowPadInput {
  readonly left: StickValue = { x: 0, y: 0 };
  readonly right: StickValue = { x: 0, y: 0 };
  upHeld = false;
  private leftHeld = false;
  private rightHeld = false;
  private bindings: Bound[] = [];

  constructor(leftEl: HTMLElement, rightEl: HTMLElement, upEl?: HTMLElement) {
    this.bindings.push(this.bind(leftEl, 'left'));
    this.bindings.push(this.bind(rightEl, 'right'));
    if (upEl) this.bindings.push(this.bind(upEl, 'up'));
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
      if (side === 'left') this.leftHeld = true;
      else if (side === 'right') this.rightHeld = true;
      else this.upHeld = true;
      this.recompute();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      el.classList.remove('pressed');
      if (side === 'left') this.leftHeld = false;
      else if (side === 'right') this.rightHeld = false;
      else this.upHeld = false;
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
