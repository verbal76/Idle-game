// Music URLs come from the React Native side, not the singlefile JS
// bundle. App.tsx resolves the three MP3 modules through expo-asset
// (which lands them in the APK's cache as file:// URIs at runtime),
// then injectJavaScript()s the URI list into the WebView. The MP3
// bytes never traverse the Binder IPC channel that limits the
// `source.html` payload to ~5–10 MB, so audio of any size streams
// without bloating the page bundle (the previous 19.6 MB inline
// approach is what caused the black-screen crash in PR #27).

interface Track { url: string; title: string }

declare global {
  interface Window {
    __MUSIC_URLS__?: Track[];
  }
}

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
  private playlist: Track[] = [];
  private trackIdx = 0;
  private wantPlaying = false;
  private volume = 0.7;
  // Last advance-on-error timestamp; rate-limited to once / 500 ms so a
  // bad track that fires repeated `error` events can't spin into a
  // runaway advance loop.
  private lastErrorAdvance = 0;

  constructor() {
    const a = new Audio();
    // 'metadata' instead of 'auto' — only the current track preloads
    // its header, not all three at boot.
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

    // Pick up URLs already injected by App.tsx if the early shot won
    // the race against bundle parse time. Fallback for the late-load
    // case is the 'music-urls' CustomEvent listener below.
    if (Array.isArray(window.__MUSIC_URLS__)) {
      this.playlist = window.__MUSIC_URLS__;
    }
    window.addEventListener('music-urls', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!Array.isArray(detail)) return;
      this.playlist = detail as Track[];
      this.trackIdx = 0;
      // If a previous start() set wantPlaying = true on an empty
      // playlist, kick playback now that we have URLs.
      if (this.wantPlaying && !this.audio.src) {
        void this.start();
      }
    });

    // Auto-resume guards for the "music stops mid-song on the menu
    // screens" symptom. The Android WebView aggressively pauses
    // background audio when:
    //   * the WebView loses focus (user backgrounded the app, then
    //     came back)
    //   * memory pressure trips an audio focus loss
    //   * the page is hidden behind another overlay
    // The HTMLAudioElement's `pause` event fires for all of those.
    // If we wanted to be playing, retry start() — idempotent and
    // self-recovers without burning a play() request when the
    // browser actually wants the audio paused (the play() promise
    // rejects on autoplay block; we silence and try again later).
    const resumeIfWanted = () => {
      if (!this.wantPlaying) return;
      if (this.playlist.length === 0) return;
      if (this.audio.paused) {
        this.audio.play().catch(() => {/* will retry on next event */});
      }
    };
    a.addEventListener('pause', () => {
      // 200 ms delay: when advance() / loadCurrent() swap audio.src,
      // pause fires synchronously before the new track plays. Don't
      // race with that — wait, then verify paused state and retry.
      setTimeout(resumeIfWanted, 200);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) resumeIfWanted();
    });
    // Watchdog: every 5 s, if we want to be playing and aren't,
    // try again. Catches the case where the WebView paused us due
    // to focus / power reasons that didn't fire a discrete event.
    setInterval(resumeIfWanted, 5000);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.audio.volume = this.volume;
  }

  getVolume(): number { return this.volume; }

  // Try to begin or resume playback. Idempotent — safe to call from
  // every menu click; the underlying HTMLAudioElement only takes
  // action when state actually changes. No-op when the playlist is
  // empty; calling later (after the music-urls event lands) starts
  // playback as expected.
  async start(): Promise<void> {
    this.wantPlaying = true;
    if (this.playlist.length === 0) return;
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
    if (this.playlist.length === 0) return '(loading…)';
    return this.playlist[this.trackIdx].title;
  }

  private advance(): void {
    if (this.playlist.length === 0) return;
    this.trackIdx = (this.trackIdx + 1) % this.playlist.length;
    this.loadCurrent();
    if (this.wantPlaying) {
      void this.audio.play().catch(() => {/* see start() */});
    }
  }

  private loadCurrent(): void {
    if (this.playlist.length === 0) return;
    this.audio.src = this.playlist[this.trackIdx].url;
    this.audio.load();
  }
}
