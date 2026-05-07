// PR #27 inlined three MP3s as base64 data URLs. With Vite's
// assetsInlineLimit set to 100 MB, those got baked into html-bundle.ts
// and pushed the singlefile build to 19.6 MB. App.tsx hands the entire
// bundle to react-native-webview as a `source.html` string, which on
// Android marshals via the Binder IPC channel. Binder transactions
// silently fail above ~5–10 MB, so the WebView never received the
// HTML and the app booted to a black screen.
//
// Quick unblock: stub the playlist to empty so the bundle drops back
// to ~7 MB and the app loads. Music itself is parked until the audio
// is reloaded via a separate native-asset bridge (file:// URIs handed
// in via injectedJavaScriptBeforeContentLoaded), which doesn't go
// through the same IPC path.
const PLAYLIST: { url: string; title: string }[] = [];

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
  // Last advance-on-error timestamp; rate-limited to once / 500 ms so a
  // bad track that fires repeated `error` events can't spin into a
  // runaway advance loop.
  private lastErrorAdvance = 0;

  constructor() {
    const a = new Audio();
    // 'metadata' instead of 'auto' — when the playlist repopulates only
    // the current track preloads, not all three at boot.
    a.preload = 'metadata';
    a.loop = false;
    a.volume = this.volume;
    a.addEventListener('ended', () => this.advance());
    // Track-load error (corrupt asset, network blip, missing file): hop
    // to the next track instead of getting stuck silently. Rate-limited
    // so a chain of error events can't recurse the playlist.
    a.addEventListener('error', () => {
      const now = performance.now();
      if (now - this.lastErrorAdvance < 500) return;
      this.lastErrorAdvance = now;
      this.advance();
    });
    this.audio = a;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.audio.volume = this.volume;
  }

  getVolume(): number { return this.volume; }

  // Try to begin or resume playback. Idempotent — safe to call from
  // every menu click; the underlying HTMLAudioElement only takes
  // action when state actually changes. No-op when the playlist is
  // empty (current state during the bundle-size unblock).
  async start(): Promise<void> {
    if (PLAYLIST.length === 0) return;
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

  currentTitle(): string {
    if (PLAYLIST.length === 0) return '(no music loaded)';
    return PLAYLIST[this.trackIdx].title;
  }

  private advance(): void {
    if (PLAYLIST.length === 0) return;
    this.trackIdx = (this.trackIdx + 1) % PLAYLIST.length;
    this.loadCurrent();
    if (this.wantPlaying) {
      void this.audio.play().catch(() => {/* see start() */});
    }
  }

  private loadCurrent(): void {
    if (PLAYLIST.length === 0) return;
    this.audio.src = PLAYLIST[this.trackIdx].url;
    this.audio.load();
  }
}
