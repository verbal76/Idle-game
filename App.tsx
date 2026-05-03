import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import { HTML_BUNDLE } from './src/__generated__/html-bundle';

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
  }
}

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
