import song1 from '../assets/music/Powder_Parade.mp3';
import song2 from '../assets/music/Trail_Snack_Parade.mp3';
import song3 from '../assets/music/Fresh_Powder_Run.mp3';

const PLAYLIST: { url: string; title: string }[] = [
  { url: song1, title: 'Powder Parade' },
  { url: song2, title: 'Trail Snack Parade' },
  { url: song3, title: 'Fresh Powder Run' },
];

// Tiny background-music player that owns one HTMLAudioElement, cycles
// the playlist on track end, and exposes a 0..1 volume knob the
// settings UI can drive. Lives at the bootstrap layer so it survives
// across runs (Game gets disposed and recreated each session).
//
// Autoplay note: WebView/browser autoplay policies block .play() until
// the user interacts with the page. Bootstrap calls start() from the
// first menu-button click; calling it earlier silently no-ops.
export class MusicPlayer {
  private audio: HTMLAudioElement;
  private trackIdx = 0;
  private wantPlaying = false;
  private volume = 0.7;

  constructor() {
    const a = new Audio();
    a.preload = 'auto';
    a.loop = false;
    a.volume = this.volume;
    a.addEventListener('ended', () => this.advance());
    // Autoplay-block: a failed .play() rejects with a NotAllowedError.
    // Swallow it; start() will retry on the next user interaction.
    a.addEventListener('error', () => {/* noop — fall through to advance on next call */});
    this.audio = a;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.audio.volume = this.volume;
  }

  getVolume(): number { return this.volume; }

  // Try to begin or resume playback. Idempotent — safe to call from
  // every menu click; the underlying HTMLAudioElement only takes
  // action when state actually changes.
  async start(): Promise<void> {
    this.wantPlaying = true;
    if (!this.audio.src) this.loadCurrent();
    if (this.audio.paused) {
      try { await this.audio.play(); }
      catch { /* autoplay still blocked; user will click again */ }
    }
  }

  pause(): void {
    this.wantPlaying = false;
    this.audio.pause();
  }

  // Hop to the next track manually (also wired to the audio's `ended`
  // event for natural rotation through the playlist).
  next(): void { this.advance(); }

  currentTitle(): string { return PLAYLIST[this.trackIdx].title; }

  private advance(): void {
    this.trackIdx = (this.trackIdx + 1) % PLAYLIST.length;
    this.loadCurrent();
    if (this.wantPlaying) {
      void this.audio.play().catch(() => {/* see start() */});
    }
  }

  private loadCurrent(): void {
    this.audio.src = PLAYLIST[this.trackIdx].url;
    this.audio.load();
  }
}
