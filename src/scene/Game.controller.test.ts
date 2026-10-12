// Gameplay preservation for controller support: the SAME scripted ride, fed
// through touch (as before), a gamepad, or the keyboard, must produce the
// identical trajectory and scoring. Controller input only changes how the
// four game inputs are produced, never what the game does with them.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Game, type GameInput } from './Game';
import { Stage } from './Stage';
import { defaultScript, installBrowserGlobals, traceRow, type ScriptedInput, type TraceRow } from '../test/gameHarness';
import { InputHub, type HubOptions } from '../input/hub';
import { KeyboardSource } from '../input/keyboard';
import { createGameInput } from '../input/mux';
import { PAD } from '../input/actions';
import type { PadSnapshot } from '../input/gamepad';

vi.mock('./babylon', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

const FRAMES = 1800;
const UPG = { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 };
const idleTouch = { steer: { left: { x: 0, y: 0 }, upHeld: false }, buttons: { jumpHeld: false, flipHeld: false } };

function padOf(s: ScriptedInput): PadSnapshot {
  const buttons = Array.from({ length: 17 }, () => false);
  buttons[PAD.south] = s.jump;
  buttons[PAD.west] = s.flip;
  buttons[PAD.lb] = s.forward;
  return { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', axes: [s.steer, 0, 0, 0], buttons };
}

type Route = (frame: () => number, script: (f: number) => ScriptedInput) => { input: GameInput; step(): void };

const direct: Route = (frame, script) => ({
  input: {
    leftStick: () => ({ x: script(frame()).steer, y: 0 }),
    jumpHeld: () => script(frame()).jump,
    flipHeld: () => script(frame()).flip,
    forwardHeld: () => script(frame()).forward,
  },
  step() { /* reads the script live */ },
});

const viaPad: Route = (frame, script) => {
  let current: PadSnapshot = padOf(script(0));
  const opts: HubOptions = { getPads: () => [current], now: () => frame() * (1000 / 60) };
  const hub = new InputHub(opts);
  hub.poll();
  const input = createGameInput(idleTouch, hub, null);
  return { input, step() { current = padOf(script(frame())); hub.poll(); } };
};

const viaKeyboard: Route = (frame, script) => {
  const target = new EventTarget();
  const kb = new KeyboardSource(target);
  const down = new Set<string>();
  const fire = (type: string, code: string) => target.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
  const input = createGameInput(idleTouch, null, kb);
  return {
    input,
    step() {
      const s = script(frame());
      const want = new Set<string>();
      if (s.steer > 0) want.add('ArrowRight'); else if (s.steer < 0) want.add('ArrowLeft');
      if (s.jump) want.add('Space');
      if (s.flip) want.add('KeyF');
      if (s.forward) want.add('ShiftLeft');
      for (const c of down) if (!want.has(c)) { fire('keyup', c); down.delete(c); }
      for (const c of want) if (!down.has(c)) { fire('keydown', c); down.add(c); }
    },
  };
};

function ride(mode: 'downhill' | 'half-pipe', route: Route): TraceRow[] {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  let frame = 0;
  const r = route(() => frame, defaultScript);
  const game = new Game(new Stage({} as HTMLCanvasElement), mode, r.input, {}, UPG);
  game.start();
  const tick = (game as unknown as { tick: () => void }).tick.bind(game);
  const rows: TraceRow[] = [];
  for (frame = 0; frame < FRAMES; frame++) {
    r.step();
    vi.advanceTimersByTime(1000 / 60);
    tick();
    if (frame % 15 === 0) rows.push(traceRow(frame, game));
  }
  game.dispose();
  vi.useRealTimers();
  return rows;
}

describe('controller input preserves gameplay', () => {
  beforeAll(() => installBrowserGlobals());
  afterEach(() => vi.useRealTimers());

  for (const mode of ['downhill', 'half-pipe'] as const) {
    it(`${mode}: gamepad ride is identical to the touch-path ride`, () => {
      const base = ride(mode, direct);
      expect(base[base.length - 1].z).toBeGreaterThan(20);
      expect(ride(mode, viaPad)).toEqual(base);
    }, 120_000);
    it(`${mode}: keyboard ride is identical to the touch-path ride`, () => {
      expect(ride(mode, viaKeyboard)).toEqual(ride(mode, direct));
    }, 120_000);
  }
});
