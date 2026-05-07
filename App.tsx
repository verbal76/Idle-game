import React, { useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Updates from 'expo-updates';
import { HTML_BUNDLE } from './src/__generated__/html-bundle';

interface OtaInfo {
  updateId: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  createdAt: string | null;
  isEmbeddedLaunch: boolean | null;
}

// Native-side music tracks. The MP3s live in src/assets/music/ and are
// bundled into the APK by Metro via require() (so they ship as native
// assets, NOT inlined into the html-bundle.ts that the WebView loads).
// Asset.fromModule() resolves to a file:// URI synchronously when the
// asset is already on disk (production APK); the URI gets injected
// into the WebView so HTMLAudioElement on the web side streams from
// it without going through the Binder IPC channel that limits
// source.html size.
const MUSIC_TRACKS: { module: number; title: string }[] = [
  { module: require('./src/assets/music/Powder_Parade.mp3'),      title: 'Powder Parade' },
  { module: require('./src/assets/music/Trail_Snack_Parade.mp3'), title: 'Trail Snack Parade' },
  { module: require('./src/assets/music/Fresh_Powder_Run.mp3'),   title: 'Fresh Powder Run' },
];

function readOtaInfo(): OtaInfo {
  // Each field is guarded — in dev / Expo Go, several of these throw
  // or return null. The About panel surfaces what's available and
  // labels the rest as "n/a" rather than crashing the app.
  const safe = <T,>(fn: () => T, fallback: T): T => {
    try { return fn(); } catch { return fallback; }
  };
  const created = safe(() => Updates.createdAt, null);
  return {
    updateId:        safe(() => Updates.updateId ?? null, null),
    runtimeVersion:  safe(() => Updates.runtimeVersion ?? null, null),
    channel:         safe(() => Updates.channel ?? null, null),
    createdAt:       created instanceof Date ? created.toISOString() : null,
    isEmbeddedLaunch: safe(() => Updates.isEmbeddedLaunch ?? null, null),
  };
}

const OTA_INFO = readOtaInfo();

// Synchronously resolve the localUri of each bundled MP3. Asset.fromModule
// is sync; for assets baked into the APK at build time, localUri is
// available immediately (no network round-trip). For Expo Go / dev
// builds the URI may be a Metro http:// URL, which the WebView can also
// stream. downloadAsync runs as a no-op safety net in the useEffect
// below (it's a no-op when localUri is already set).
const RESOLVED_MUSIC_URLS = MUSIC_TRACKS.map((t) => {
  const a = Asset.fromModule(t.module);
  return { url: a.localUri ?? a.uri, title: t.title };
});

// Pre-content injection: window.__OTA__ AND window.__MUSIC_URLS__ both
// land before any web JS runs, so MusicPlayer reads them at module
// construction without needing a CustomEvent round-trip. The
// 'music-urls' / 'ota-info' events still fire from the post-load
// re-injection as belt-and-suspenders for the Android cold-start race.
const INJECTED_JS_BEFORE = `
  window.__OTA__ = ${JSON.stringify(OTA_INFO)};
  window.__MUSIC_URLS__ = ${JSON.stringify(RESOLVED_MUSIC_URLS)};
  true;
`;

// Re-injected after onLoadEnd as a backup for the early-injection race.
// Sets window.__OTA__ + window.__MUSIC_URLS__ if the early shot missed
// AND dispatches custom events so any UI already mounted refreshes.
const INJECTED_JS_AFTER = `
  (function() {
    var ota = ${JSON.stringify(OTA_INFO)};
    var music = ${JSON.stringify(RESOLVED_MUSIC_URLS)};
    window.__OTA__ = window.__OTA__ || ota;
    window.__MUSIC_URLS__ = window.__MUSIC_URLS__ || music;
    try { window.dispatchEvent(new CustomEvent('ota-info', { detail: window.__OTA__ })); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('music-urls', { detail: window.__MUSIC_URLS__ })); } catch (e) {}
  })();
  true;
`;

// Inject a minimal status update to the web side so Settings can show
// "Up to date" / "Downloading…" / "Update ready — restart now?".
function injectUpdateStatus(ref: React.RefObject<WebView | null>, status: string): void {
  const js = `
    (function() {
      window.__UPDATE_STATUS__ = ${JSON.stringify(status)};
      try { window.dispatchEvent(new CustomEvent('update-status', { detail: ${JSON.stringify(status)} })); } catch (e) {}
    })();
    true;
  `;
  ref.current?.injectJavaScript(js);
}

// Run an explicit Updates check + fetch + (optionally) reload. Surfaces
// status to the web side so the Settings UI / a banner can react.
async function runUpdateCheck(ref: React.RefObject<WebView | null>, autoReload: boolean): Promise<void> {
  try {
    injectUpdateStatus(ref, 'checking');
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) {
      injectUpdateStatus(ref, 'up-to-date');
      return;
    }
    injectUpdateStatus(ref, 'downloading');
    await Updates.fetchUpdateAsync();
    if (autoReload) {
      injectUpdateStatus(ref, 'reloading');
      await Updates.reloadAsync();
    } else {
      injectUpdateStatus(ref, 'ready');
    }
  } catch {
    // checkForUpdateAsync throws in Expo Go and on certain network
    // errors. Treat as up-to-date so the manual button doesn't get
    // stuck on "checking".
    injectUpdateStatus(ref, 'unavailable');
  }
}

/**
 * Bridges WebView → native orientation lock. The web side posts:
 *   'orientation:landscape' — lock landscape (in-game)
 *   'orientation:default'   — unlock to system default (menus)
 *   'quit:app'              — close the app on Android
 *   'updates:check'         — manual update check from Settings
 *   'updates:apply'         — reload now (after a downloaded update)
 */
function createMessageHandler(webviewRef: React.RefObject<WebView | null>) {
  return function handleMessage(event: WebViewMessageEvent): void {
    const data = event.nativeEvent.data;
    if (data === 'orientation:landscape') {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else if (data === 'orientation:default') {
      void ScreenOrientation.unlockAsync();
    } else if (data === 'quit:app') {
      // Quit Game button on the main menu — close the app on Android.
      // exitApp is a no-op on iOS by design (Apple HIG forbids self-
      // termination), but this build is android-only per app.json.
      BackHandler.exitApp();
    } else if (data === 'updates:check') {
      void runUpdateCheck(webviewRef, /* autoReload */ false);
    } else if (data === 'updates:apply') {
      void Updates.reloadAsync();
    }
  };
}

export default function App(): React.JSX.Element {
  const webviewRef = useRef<WebView>(null);

  // Expo Go / dev-server case: Asset.fromModule's localUri is null
  // until downloadAsync runs (the asset has to be fetched from Metro).
  // The synchronous URL list in INJECTED_JS_BEFORE captured `a.uri`
  // (Metro URL) as a fallback so playback works immediately; once
  // downloadAsync completes, re-inject with the canonical localUri.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resolved = await Promise.all(
          MUSIC_TRACKS.map(async (t) => {
            const a = Asset.fromModule(t.module);
            await a.downloadAsync();
            return { url: a.localUri ?? a.uri, title: t.title };
          })
        );
        if (cancelled) return;
        const js = `(function(){var u=${JSON.stringify(resolved)};window.__MUSIC_URLS__=u;try{window.dispatchEvent(new CustomEvent('music-urls',{detail:u}));}catch(e){}})();true;`;
        webviewRef.current?.injectJavaScript(js);
      } catch {
        // Asset resolution failed (rare). Player relies on the
        // synchronous URL list from the early injection above.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto check + fetch + reload on launch. Runs in the background so
  // a slow network never blocks startup. fallbackToCacheTimeout in
  // app.json (3000 ms) wasn't enough for the 23 MiB OTA to download
  // before launch — this fires AFTER the WebView is up and gives the
  // OTA the full session to fetch. autoReload=true means we restart
  // the app the moment the update is ready, so the user sees the new
  // build mid-session instead of having to kill + relaunch (which
  // typically happens before the background download even finishes).
  useEffect(() => {
    const t = setTimeout(() => { void runUpdateCheck(webviewRef, /* autoReload */ true); }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        ref={webviewRef}
        source={{ html: HTML_BUNDLE, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        // file:// URIs from Asset.downloadAsync() need this on Android
        // for HTMLAudioElement to load them when the page origin is
        // https://localhost/. Default is false; flip it on so audio
        // streams without rebuilding the bundle.
        allowFileAccess
        allowFileAccessFromFileURLs
        mediaPlaybackRequiresUserAction={false}
        scalesPageToFit={false}
        bounces={false}
        scrollEnabled={false}
        overScrollMode="never"
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE}
        onLoadEnd={() => {
          // Belt-and-suspenders: re-inject after load so the web side
          // picks up window.__OTA__ even if the early injection lost
          // the race on Android cold start.
          webviewRef.current?.injectJavaScript(INJECTED_JS_AFTER);
        }}
        onMessage={createMessageHandler(webviewRef)}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0b1320' },
  webview: { flex: 1, backgroundColor: '#0b1320' }
});
