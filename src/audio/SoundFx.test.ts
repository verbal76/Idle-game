import { describe, expect, it } from 'vitest';
import { RECIPES, SoundFx, type AudioLike, type SfxName } from './SoundFx';

// A fake Web Audio context that records what the player schedules.
function fakeCtx() {
  const log = { starts: 0, peaks: [] as number[], freqs: [] as number[] };
  const param = (onSet?: (v: number) => void) => ({
    value: 0,
    setValueAtTime: (v: number) => onSet?.(v),
    linearRampToValueAtTime: (v: number) => { log.peaks.push(v); },
    exponentialRampToValueAtTime: () => {},
  });
  const node = () => ({ connect: () => {} });
  const ctx = {
    currentTime: 0, state: 'running', destination: {}, sampleRate: 8000,
    resume: async () => {},
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => ({ ...node(), type: 'sine', frequency: param(v => log.freqs.push(v)), start: () => { log.starts++; }, stop: () => {} }),
    createBufferSource: () => ({ ...node(), buffer: null, start: () => { log.starts++; }, stop: () => {} }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', Q: { value: 0 }, frequency: param(v => log.freqs.push(v)) }),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return { ctx: ctx as unknown as AudioLike, log };
}

describe('synthesized SFX (#26)', () => {
  const names = Object.keys(RECIPES) as SfxName[];

  it('has the full set: movement, tricks, crashes, rewards and UI', () => {
    for (const n of ['jump', 'land', 'trick', 'bigTrick', 'sketchy', 'bail', 'crash', 'grace', 'combo', 'ring', 'boost', 'purchase', 'newBest', 'goal', 'tap'] as SfxName[]) {
      expect(RECIPES[n]?.length).toBeGreaterThan(0);
    }
  });

  it('every sound is short and never loud', () => {
    for (const n of names) {
      for (const v of RECIPES[n]) {
        expect(v.vol).toBeLessThanOrEqual(0.3);
        expect(v.at + v.dur).toBeLessThanOrEqual(0.8);
        expect(v.freq).toBeGreaterThan(20);
      }
    }
  });

  it('scales every voice by the SFX volume', () => {
    const { ctx, log } = fakeCtx();
    const fx = new SoundFx(() => ctx);
    fx.setVolume(0.5);
    fx.play('bigTrick');
    expect(log.starts).toBe(RECIPES.bigTrick.length);
    expect(log.peaks).toEqual(RECIPES.bigTrick.map(v => v.vol * 0.5));
  });

  it('volume 0 schedules nothing (and never creates a context)', () => {
    let made = 0;
    const fx = new SoundFx(() => { made++; return fakeCtx().ctx; });
    fx.setVolume(0);
    for (const n of names) fx.play(n);
    expect(made).toBe(0);
  });

  it('pitch scales frequencies (combo steps up)', () => {
    const { ctx, log } = fakeCtx();
    const fx = new SoundFx(() => ctx);
    fx.play('combo', 1.5);
    expect(log.freqs).toEqual([RECIPES.combo[0].freq * 1.5]);
  });

  it('is silent without Web Audio (tests, old WebViews)', () => {
    const fx = new SoundFx(() => null);
    expect(() => fx.play('crash')).not.toThrow();
  });
});
