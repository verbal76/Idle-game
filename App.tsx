import React, { useRef } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
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
// Pre-content injection: best-effort fast path so window.__OTA__ is set
// before the bundle's main.ts runs. Has a known race on Android cold
// start, so we ALSO post the same payload after onLoadEnd as backup.
const INJECTED_JS_BEFORE = `
  window.__OTA__ = ${JSON.stringify(OTA_INFO)};
  true;
`;
// Re-injected after onLoadEnd as a backup for the early-injection race.
// Sets window.__OTA__ if the early shot missed AND dispatches a custom
// event so any UI already mounted refreshes its display.
const INJECTED_JS_AFTER = `
  (function() {
    var ota = ${JSON.stringify(OTA_INFO)};
    window.__OTA__ = window.__OTA__ || ota;
    try { window.dispatchEvent(new CustomEvent('ota-info', { detail: window.__OTA__ })); } catch (e) {}
  })();
  true;
`;

/**
 * Bridges WebView → native orientation lock. The web side posts:
 *   'orientation:landscape' — lock landscape (in-game)
 *   'orientation:default'   — unlock to system default (menus)
 */
function handleMessage(event: WebViewMessageEvent): void {
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
  }
}

export default function App(): React.JSX.Element {
  const webviewRef = useRef<WebView>(null);
  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        ref={webviewRef}
        source={{ html: HTML_BUNDLE, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
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
        onMessage={handleMessage}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0b1320' },
  webview: { flex: 1, backgroundColor: '#0b1320' }
});
