import React, { useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Updates from 'expo-updates';
import { HTML_BUNDLE } from './src/__generated__/html-bundle';
import { UpdateGate } from './src/shell/updateGate';

// A downloaded OTA never reloads mid-run; it waits for the page's run:end.
const updateGate = new UpdateGate();

interface OtaInfo {
  updateId: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  createdAt: string | null;
  isEmbeddedLaunch: boolean | null;
}

const MUSIC_TRACKS: { module: number; title: string }[] = [
  { module: require('./src/assets/music/Powder_Parade.mp3'),      title: 'Powder Parade' },
  { module: require('./src/assets/music/Trail_Snack_Parade.mp3'), title: 'Trail Snack Parade' },
  { module: require('./src/assets/music/Fresh_Powder_Run.mp3'),   title: 'Fresh Powder Run' },
];

function readOtaInfo(): OtaInfo {
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

const RESOLVED_MUSIC_URLS = MUSIC_TRACKS.map((t) => {
  const a = Asset.fromModule(t.module);
  return { url: a.localUri ?? a.uri, title: t.title };
});

const INJECTED_JS_BEFORE = `
  window.__OTA__ = ${JSON.stringify(OTA_INFO)};
  window.__MUSIC_URLS__ = ${JSON.stringify(RESOLVED_MUSIC_URLS)};
  true;
`;

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
    if (autoReload && updateGate.onUpdateReady() === 'defer') {
      injectUpdateStatus(ref, 'ready');
      return;
    }
    if (autoReload) {
      await reloadNow(ref);
    } else {
      injectUpdateStatus(ref, 'ready');
    }
  } catch {
    injectUpdateStatus(ref, 'unavailable');
  }
}

async function reloadNow(ref: React.RefObject<WebView | null>): Promise<void> {
  try {
    injectUpdateStatus(ref, 'reloading');
    // Stop audio in the old WebView context BEFORE the bundle swap.
    // MusicPlayer's hardStop listener calls audio.pause() AND
    // audio.src='' to detach from the underlying Android MediaPlayer
    // immediately, otherwise its small playback buffer keeps emitting
    // sound for ~50–200 ms while the new bundle's MusicPlayer is
    // already starting — user hears the soundtrack twice.
    ref.current?.injectJavaScript(
      `try{window.dispatchEvent(new Event('music-pause-before-reload'));}catch(e){};true;`
    );
    // 200 ms delay (was 80) so the pause + src='' detachment in
    // hardStop has time to actually silence Android's MediaPlayer
    // before we tear down the JS context. Combined with the 250 ms
    // delay on the new bundle's music.start(), there's a 450 ms
    // total gap between old-audio-stop and new-audio-start.
    await new Promise(r => setTimeout(r, 200));
    await Updates.reloadAsync();
  } catch {
    injectUpdateStatus(ref, 'unavailable');
  }
}

function createMessageHandler(webviewRef: React.RefObject<WebView | null>) {
  return function handleMessage(event: WebViewMessageEvent): void {
    const data = event.nativeEvent.data;
    if (data === 'orientation:landscape') {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else if (data === 'orientation:default') {
      void ScreenOrientation.unlockAsync();
    } else if (data === 'quit:app' || data === 'back:exit') {
      // back:exit = the page didn't handle a hardware Back (root screen).
      BackHandler.exitApp();
    } else if (data === 'updates:check') {
      void runUpdateCheck(webviewRef, /* autoReload */ false);
    } else if (data === 'run:start') {
      updateGate.setInRun(true);
    } else if (data === 'run:end') {
      // Back on the menus with the run saved: apply a deferred update now.
      if (updateGate.setInRun(false)) void reloadNow(webviewRef);
    } else if (data === 'updates:apply') {
      void Updates.reloadAsync();
    }
  };
}

export default function App(): React.JSX.Element {
  const webviewRef = useRef<WebView>(null);

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
        /* Asset resolution failed (rare) */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Hardware Back goes to the page first (pause menu in a run); the page
  // posts back:exit when nothing on screen wants it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      webviewRef.current?.injectJavaScript(
        `try{if(window.__wtbBack){window.__wtbBack();}else{window.ReactNativeWebView.postMessage('back:exit');}}catch(e){};true;`
      );
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void runUpdateCheck(webviewRef, /* autoReload */ true); }, 1500);
    const i = setInterval(() => { void runUpdateCheck(webviewRef, /* autoReload */ true); }, 90 * 1000);
    return () => { clearTimeout(t); clearInterval(i); };
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        key={OTA_INFO.updateId ?? 'embedded'}
        ref={webviewRef}
        source={{ html: HTML_BUNDLE, baseUrl: `https://localhost/${OTA_INFO.updateId ?? 'embedded'}/` }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        allowFileAccess
        allowFileAccessFromFileURLs
        mediaPlaybackRequiresUserAction={false}
        scalesPageToFit={false}
        bounces={false}
        scrollEnabled={false}
        overScrollMode="never"
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE}
        onLoadEnd={() => {
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
