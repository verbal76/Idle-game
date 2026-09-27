// Deterministic headless harness for the real Game class.
//
// Babylon runs on NullEngine (no GPU); textures are stubbed; time is
// driven by vitest fake timers with a fixed 60 Hz step; inputs come
// from a scripted function of the frame index. Everything else —
// physics, world generation, collisions, scoring — is the production
// code, so a recorded trajectory is a behavioral fingerprint.
//
// Import this module (and call installHarnessMocks via vi.mock
// factories in the test file) BEFORE importing Game.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function installBrowserGlobals(): void {
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.window) {
    g.window = {
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
      },
    };
  }
}

// Vite's `?url` import yields a dev path in tests, not a data URL.
export function readAssetAsBuffer(url: string): ArrayBuffer {
  const path = resolve(__dirname, '../..', url.replace(/^\//, '').replace(/\?.*$/, ''));
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export interface ScriptedInput {
  steer: number;       // -1 | 0 | 1
  jump: boolean;
  flip: boolean;
  forward: boolean;
}

// Default script: weave, charge-and-release jumps, hold flip in the
// air, occasional deep carve. Exercises steering, jumping, flipping,
// landing (clean + bail), auto-centering and collisions.
export function defaultScript(frame: number): ScriptedInput {
  const t = frame % 600;
  const steer = t < 90 ? 1 : t < 150 ? 0 : t < 240 ? -1 : t < 300 ? 0 : t < 330 ? 1 : 0;
  const jump = (t >= 340 && t < 380) || (t >= 480 && t < 530);
  const flip = (t >= 385 && t < 440) || (t >= 535 && t < 560);
  const forward = t >= 60 && t < 120;
  return { steer, jump, flip, forward };
}

export interface TraceRow {
  f: number; x: number; y: number; z: number;
  heading: number; speed: number; grounded: boolean; state: string;
  coins: number; flips: number; spins: number; fell: boolean;
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function traceRow(f: number, game: unknown): TraceRow {
  const g = game as Record<string, any>;
  const p = g.rider.root.position;
  return {
    f, x: r4(p.x), y: r4(p.y), z: r4(p.z),
    heading: r4(g.heading), speed: r4(g.speed), grounded: !!g.grounded,
    state: String(g.state), coins: r4(g.coinsCollected), flips: g.flipsLanded,
    spins: g.spinsLanded, fell: !!g.fellAlready,
  };
}
