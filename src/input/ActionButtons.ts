type Action = 'jump' | 'flip';

interface Bound {
  el: HTMLElement;
  onDown: (e: PointerEvent) => void;
  onUp: (e: PointerEvent) => void;
}

/**
 * Hold-to-press tracking for the on-screen JUMP / FLIP buttons.
 * Game.tick() reads jumpHeld/flipHeld each frame.
 */
export class ActionButtons {
  jumpHeld = false;
  flipHeld = false;
  private bindings: Bound[] = [];

  constructor(jumpEl: HTMLElement, flipEl: HTMLElement) {
    this.bindings.push(this.bind(jumpEl, 'jump'));
    this.bindings.push(this.bind(flipEl, 'flip'));
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

  private bind(el: HTMLElement, action: Action): Bound {
    let activeId: number | null = null;

    const onDown = (e: PointerEvent) => {
      if (activeId !== null) return;
      activeId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add('pressed');
      if (action === 'jump') this.jumpHeld = true;
      else this.flipHeld = true;
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      el.classList.remove('pressed');
      if (action === 'jump') this.jumpHeld = false;
      else this.flipHeld = false;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);

    return { el, onDown, onUp };
  }
}
