// Procedural sound effects: every sound is a short recipe of
// oscillator / noise voices with gain envelopes (no asset files), so it
// ships with the bundle for free and tunes with code.
//
// The AudioContext is created lazily (so the first sound doesn't pay the
// creation cost mid-frame, and nothing trips autoplay warnings before
// the first tap). The SFX volume comes from the profile's settings.

export type SfxName =
  | 'ring' | 'boost'
  | 'jump' | 'land' | 'trick' | 'bigTrick' | 'sketchy' | 'bail' | 'crash' | 'grace' | 'combo'
  | 'purchase' | 'newBest' | 'goal' | 'tap';

/** One voice of a sound. Times in seconds from the sound's start. */
export interface Voice {
  at: number;
  dur: number;
  vol: number;                 // peak gain at SFX volume 1
  type: OscillatorType | 'noise';
  freq: number;                // start frequency (noise: band-pass centre)
  to?: number;                 // exponential sweep target frequency
}

const note = (at: number, freq: number, dur: number, vol = 0.2, type: OscillatorType = 'sine'): Voice => ({ at, freq, dur, vol, type });

export const RECIPES: Record<SfxName, Voice[]> = {
  // Three-note ascending arpeggio (C5 E5 G5): a positive collect cue.
  ring: [note(0, 523.25, 0.18, 0.22), note(0.06, 659.25, 0.22, 0.22), note(0.12, 783.99, 0.3, 0.22)],
  // Low rumble to mid-high: reads as speed, covers the boost.
  boost: [{ at: 0, dur: 0.45, vol: 0.18, type: 'sawtooth', freq: 120, to: 440 }],
  jump: [{ at: 0, dur: 0.16, vol: 0.12, type: 'noise', freq: 900, to: 2600 }, { at: 0, dur: 0.12, vol: 0.06, type: 'triangle', freq: 220, to: 420 }],
  land: [{ at: 0, dur: 0.14, vol: 0.2, type: 'noise', freq: 500, to: 180 }, { at: 0, dur: 0.1, vol: 0.14, type: 'sine', freq: 110, to: 60 }],
  trick: [note(0, 659.25, 0.12, 0.16, 'triangle'), note(0.07, 987.77, 0.2, 0.16, 'triangle')],
  bigTrick: [note(0, 523.25, 0.14, 0.16, 'triangle'), note(0.07, 659.25, 0.14, 0.16, 'triangle'), note(0.14, 783.99, 0.14, 0.16, 'triangle'), note(0.21, 1046.5, 0.35, 0.18, 'triangle')],
  sketchy: [{ at: 0, dur: 0.22, vol: 0.12, type: 'square', freq: 330, to: 250 }, { at: 0.08, dur: 0.18, vol: 0.08, type: 'square', freq: 300, to: 220 }],
  bail: [{ at: 0, dur: 0.3, vol: 0.2, type: 'noise', freq: 700, to: 200 }, { at: 0, dur: 0.25, vol: 0.14, type: 'sawtooth', freq: 180, to: 70 }],
  crash: [{ at: 0, dur: 0.6, vol: 0.26, type: 'noise', freq: 1200, to: 120 }, { at: 0, dur: 0.45, vol: 0.2, type: 'sine', freq: 90, to: 40 }],
  grace: [note(0, 783.99, 0.18, 0.14), note(0.05, 1174.66, 0.22, 0.12), note(0.1, 1567.98, 0.35, 0.1)],
  combo: [note(0, 880, 0.1, 0.12, 'square')],
  purchase: [note(0, 987.77, 0.08, 0.16, 'square'), note(0.07, 1318.51, 0.22, 0.16, 'square')],
  newBest: [note(0, 523.25, 0.12, 0.16, 'triangle'), note(0.1, 659.25, 0.12, 0.16, 'triangle'), note(0.2, 783.99, 0.12, 0.16, 'triangle'), note(0.3, 1046.5, 0.5, 0.2, 'triangle')],
  goal: [note(0, 698.46, 0.14, 0.14, 'triangle'), note(0.1, 880, 0.3, 0.16, 'triangle')],
  tap: [note(0, 1400, 0.035, 0.05, 'triangle')],
};

/** The minimal slice of the Web Audio API the player uses (tests fake it). */
export interface AudioLike {
  currentTime: number;
  state: string;
  destination: unknown;
  resume(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  createBuffer(channels: number, length: number, rate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
  createBiquadFilter(): BiquadFilterNode;
  sampleRate: number;
}

export class SoundFx {
  private ctx: AudioLike | null = null;
  private volume = 1.0;
  private noise: AudioBuffer | null = null;

  constructor(private readonly makeCtx: () => AudioLike | null = defaultCtx) {}

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  getVolume(): number {
    return this.volume;
  }

  // Resumes a suspended context (Chrome/Safari need a user gesture).
  resume(): void {
    const ctx = this.getCtx();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  /** Plays a sound; `pitch` scales every frequency (combo steps up). */
  play(name: SfxName, pitch = 1): void {
    if (this.volume <= 0) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of RECIPES[name]) this.voice(ctx, now, v, pitch);
  }

  // Kept for the existing half-pipe call sites.
  playRingChime(): void { this.play('ring'); }
  playBoostWhoosh(): void { this.play('boost'); }

  private voice(ctx: AudioLike, now: number, v: Voice, pitch: number): void {
    const t0 = now + v.at;
    const t1 = t0 + v.dur;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(v.vol * this.volume, t0 + Math.min(0.012, v.dur / 4));
    gain.gain.exponentialRampToValueAtTime(0.001, t1);
    gain.connect(ctx.destination as AudioNode);

    let src: AudioScheduledSourceNode;
    let freqParam: AudioParam;
    if (v.type === 'noise') {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      n.connect(bp);
      bp.connect(gain);
      src = n;
      freqParam = bp.frequency;
    } else {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.connect(gain);
      src = osc;
      freqParam = osc.frequency;
    }
    freqParam.setValueAtTime(v.freq * pitch, t0);
    if (v.to) freqParam.exponentialRampToValueAtTime(v.to * pitch, t1);
    src.start(t0);
    src.stop(t1 + 0.02);
  }

  private noiseBuffer(ctx: AudioLike): AudioBuffer {
    if (this.noise) return this.noise;
    const len = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    this.noise = buf;
    return buf;
  }

  private getCtx(): AudioLike | null {
    if (!this.ctx) this.ctx = this.makeCtx();
    return this.ctx;
  }
}

function defaultCtx(): AudioLike | null {
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    return Ctor ? (new Ctor() as unknown as AudioLike) : null;
  } catch {
    return null;
  }
}

export const soundFx = new SoundFx();
