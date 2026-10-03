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

export class MusicPlayer {
  private audio: HTMLAudioElement;
  private playlist: Track[] = [];
  private trackIdx = 0;
  private wantPlaying = false;
  private volume = 0.7;
  private lastErrorAdvance = 0;

  constructor() {
    const a = new Audio();
    a.preload = 'metadata';
    a.loop = false;
    a.volume = this.volume;
    a.addEventListener('ended', () => this.advance());
    a.addEventListener('error', () => {
      const now = performance.now();
      if (now - this.lastErrorAdvance < 500) return;
      this.lastErrorAdvance = now;
      this.advance();
    });
    this.audio = a;

    this.playlist = validTracks(window.__MUSIC_URLS__);
    window.addEventListener('music-urls', (e: Event) => {
      const tracks = validTracks((e as CustomEvent).detail);
      if (tracks.length === 0) return;
      this.playlist = tracks;
      this.trackIdx = 0;
      if (this.wantPlaying && !this.audio.src) {
        void this.start();
      }
    });

    // Never fight the system for audio while the app is in the
    // background: hidden pauses the music (wantPlaying stays set) and
    // coming back resumes it.
    const resumeIfWanted = () => {
      if (!this.wantPlaying || document.hidden) return;
      if (this.playlist.length === 0) return;
      if (this.audio.paused) {
        this.audio.play().catch(() => {/* will retry on next event */});
      }
    };
    a.addEventListener('pause', () => {
      setTimeout(resumeIfWanted, 200);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { try { this.audio.pause(); } catch { /* detached */ } }
      else resumeIfWanted();
    });
    setInterval(resumeIfWanted, 5000);

    // Stop audio when the page is about to unload — primarily to
    // prevent the old WebView's HTMLAudioElement from continuing
    // to play during an `Updates.reloadAsync()` bundle swap. The
    // new bundle creates a fresh MusicPlayer and calls start();
    // without this, both the old and new audio elements briefly
    // overlap and the user hears the soundtrack double-firing
    // ~1 second apart.
    const hardStop = () => {
      this.wantPlaying = false;
      try {
        this.audio.pause();
        // Detach the source — pause() alone doesn't always silence
        // the underlying Android MediaPlayer instantly (a small
        // playback buffer keeps emitting for ~50–200 ms after the
        // pause request). Setting src='' + load() forces the native
        // layer to release the audio resource immediately, closing
        // the double-music overlap window with the new WebView's
        // MusicPlayer during an OTA reload.
        this.audio.src = '';
        try { this.audio.load(); } catch { /* load on empty src may throw */ }
      } catch { /* audio may be detached */ }
    };
    window.addEventListener('pagehide', hardStop);
    window.addEventListener('beforeunload', hardStop);
    // Custom event fired by App.tsx native side immediately before
    // Updates.reloadAsync(). Belt-and-suspenders alongside pagehide,
    // because pagehide on Android WebView during a JS-bundle swap
    // is not consistently fired.
    window.addEventListener('music-pause-before-reload', hardStop);
    // The native side sends this when a reload it announced didn't
    // happen (the update failed to apply): bring the music back.
    window.addEventListener('music-resume', () => { void this.start(); });
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.audio.volume = this.volume;
  }

  getVolume(): number { return this.volume; }

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

/** Only well-formed { url, title } entries from the native side. */
function validTracks(v: unknown): Track[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t): t is Track => !!t && typeof t === 'object'
    && typeof (t as Track).url === 'string' && (t as Track).url.length > 0
    && typeof (t as Track).title === 'string');
}
