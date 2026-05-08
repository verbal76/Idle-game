// Tiny procedural sound-effect generator. Uses Web Audio API with a
// shared lazy-init AudioContext so the first beep doesn't pay the
// context-creation cost mid-frame, and so we don't trigger Chrome's
// "audio cannot autoplay" warning before the user has interacted
// with the page.
//
// Each sound is built from oscillators + gain envelopes (no asset
// files), so it ships with the bundle for free and tunes with code.

class SoundFx {
  private ctx: AudioContext | null = null;
  private volume = 1.0;

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  // Resumes a suspended context — required by Chrome/Safari after
  // the page was loaded without prior user interaction. Caller
  // (any pointer/touch handler) should invoke once on first input.
  resume(): void {
    const ctx = this.getCtx();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  // Three-note ascending arpeggio (C5 → E5 → G5). Short, bright,
  // unmistakable as a positive collect cue.
  playRingChime(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, now,        523.25, 0.18, this.volume * 0.22, 'sine');
    this.tone(ctx, now + 0.06, 659.25, 0.22, this.volume * 0.22, 'sine');
    this.tone(ctx, now + 0.12, 783.99, 0.30, this.volume * 0.22, 'sine');
  }

  // Sweep from low rumble to mid-high — reads as "speed". 450 ms so
  // it covers the boost duration and decays as the rider exits the
  // strip.
  playBoostWhoosh(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.40);
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(this.volume * 0.18, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  private getCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor: typeof AudioContext | undefined =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private tone(
    ctx: AudioContext,
    when: number,
    freq: number,
    dur: number,
    vol: number,
    type: OscillatorType,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }
}

export const soundFx = new SoundFx();
