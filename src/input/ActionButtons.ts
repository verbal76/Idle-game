import { bindHold, type HoldBinding } from './holdButton';

/**
 * Hold-to-press tracking for the on-screen JUMP / FLIP buttons.
 * Game.tick() reads jumpHeld/flipHeld each frame.
 */
export class ActionButtons {
  jumpHeld = false;
  flipHeld = false;
  private bindings: HoldBinding[];

  constructor(jumpEl: HTMLElement, flipEl: HTMLElement) {
    this.bindings = [
      bindHold(jumpEl, (h) => { this.jumpHeld = h; }),
      bindHold(flipEl, (h) => { this.flipHeld = h; }),
    ];
  }

  /** Releases both buttons (pause, backgrounding, focus loss). */
  reset(): void { for (const b of this.bindings) b.release(); }

  detach(): void { for (const b of this.bindings) b.detach(); }
}
