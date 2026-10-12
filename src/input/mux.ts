import type { GameInput } from '../scene/Game';
import type { StickValue } from './SteerStrip';
import type { InputHub } from './hub';
import type { KeyboardSource } from './keyboard';

/** The touch controls as the mux needs them (SteerStrip + ActionButtons). */
export interface TouchControls {
  steer: { left: StickValue; upHeld: boolean };
  buttons: { jumpHeld: boolean; flipHeld: boolean };
}

/**
 * One GameInput over touch + keyboard + gamepad. Every source drives the
 * same four inputs the game already reads; none adds an action.
 *
 * Touch is unchanged: with no keyboard or pad input in play, `leftStick()`
 * returns the strip's own object and the button reads are the buttons' own,
 * so a phone behaves exactly as before. Where several sources are active at
 * once, the touch strip wins steering (a thumb on the strip is deliberate);
 * buttons OR together.
 */
export function createGameInput(touch: TouchControls, hub: InputHub | null, kb: KeyboardSource | null): GameInput & { releaseAll(): void } {
  const merged: StickValue = { x: 0, y: 0 };
  return {
    leftStick: () => {
      const extra = kb?.steerX || hub?.gameplay.steerX || 0;
      if (touch.steer.left.x !== 0 || extra === 0) return touch.steer.left;
      merged.x = extra;
      return merged;
    },
    jumpHeld: () => touch.buttons.jumpHeld || !!kb?.held('jump') || !!hub?.gameplay.jump,
    flipHeld: () => touch.buttons.flipHeld || !!kb?.held('flip') || !!hub?.gameplay.flip,
    forwardHeld: () => touch.steer.upHeld || !!kb?.held('carve') || !!hub?.gameplay.carve,
    releaseAll: () => { hub?.releaseAll(); kb?.releaseAll(); },
  };
}
