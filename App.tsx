import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { HTML_BUNDLE } from './src/__generated__/html-bundle';

/**
 * The whole game lives in HTML_BUNDLE — Vite singlefile inlines Babylon,
 * code, and CSS into one HTML string at build time, then
 * scripts/embed-html.mjs writes that string into src/__generated__/.
 *
 * Setting baseUrl to https://localhost/ gives the WebView a stable origin
 * so IndexedDB (used by the profile system) persists across launches.
 */
export default function App(): React.JSX.Element {
  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        source={{ html: HTML_BUNDLE, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        databaseEnabled
        mediaPlaybackRequiresUserAction={false}
        scalesPageToFit={false}
        bounces={false}
        scrollEnabled={false}
        overScrollMode="never"
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0b1320' },
  webview: { flex: 1, backgroundColor: '#0b1320' }
});
