/**
 * The ONE action vocabulary every input source speaks. Touch, keyboard and
 * gamepad are different ways to produce these; the game and the menus only
 * ever consume them. Nothing here changes what an action does: it names
 * what the touch controls already do (see docs/controller-input.md).
 *
 * Gameplay (a run is riding):
 *   steer   analog -1..1 (the touch steering strip)
 *   carve   deep carve (the strip's outer zone); also the back-flip modifier
 *   jump    hold to charge, release to launch (the JUMP button)
 *   flip    front flip, with carve = back flip (the FLIP button)
 *   pause   the pause button / Android Back
 * Menus (any screen, overlay or the pause menu):
 *   up/down/left/right  move focus (left/right also adjust a slider)
 *   confirm             press the focused control
 *   back                the screen's Back / Cancel (same as Android Back)
 *   menu                Start/Menu: pause and resume in a run
 */
export type GameplayAction = 'carve' | 'jump' | 'flip';
export type NavAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'menu';

/** Standard-mapping button indices (W3C Gamepad API; Chromium, Electron). */
export const PAD = {
  south: 0, east: 1, west: 2, north: 3,
  lb: 4, rb: 5, lt: 6, rt: 7,
  select: 8, start: 9, l3: 10, r3: 11,
  up: 12, down: 13, left: 14, right: 15, home: 16,
} as const;
export const PAD_AXIS = { lx: 0, ly: 1, rx: 2, ry: 3 } as const;

/** Which physical buttons drive each gameplay action. */
export const PAD_GAMEPLAY: Record<GameplayAction, readonly number[]> = {
  jump: [PAD.south, PAD.rt],
  flip: [PAD.west, PAD.rb],
  carve: [PAD.lb, PAD.lt],
};

/** Which physical buttons drive each menu action (edge-triggered). */
export const PAD_NAV: Record<NavAction, readonly number[]> = {
  up: [PAD.up], down: [PAD.down], left: [PAD.left], right: [PAD.right],
  confirm: [PAD.south],
  back: [PAD.east],
  menu: [PAD.start],
};

/** Keyboard (KeyboardEvent.code) equivalents. */
export const KEY_GAMEPLAY: Record<GameplayAction, readonly string[]> = {
  jump: ['Space'],
  flip: ['KeyF'],
  carve: ['ShiftLeft', 'ShiftRight', 'ArrowUp', 'KeyW'],
};
export const KEY_STEER_LEFT: readonly string[] = ['ArrowLeft', 'KeyA'];
export const KEY_STEER_RIGHT: readonly string[] = ['ArrowRight', 'KeyD'];
export const KEY_PAUSE: readonly string[] = ['Escape', 'KeyP'];
