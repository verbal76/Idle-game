import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { WebView } from 'react-native-webview';

// Bundled with the app via assetBundlePatterns in app.json. Vite's single-file
// build collapses the entire game (Babylon, code, CSS, IndexedDB shim) into
// this one HTML file so the WebView can load it directly via file:// URI.
const INDEX_HTML = require('./dist/index.html');

export default function App(): React.JSX.Element {
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const asset = Asset.fromModule(INDEX_HTML);
        await asset.downloadAsync();
        setUri(asset.localUri ?? asset.uri);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar hidden />
      </View>
    );
  }

  if (!uri) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar hidden />
        <ActivityIndicator size="large" color="#8fb6e8" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        source={{ uri }}
        originWhitelist={['*']}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
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
  root: { flex: 1, backgroundColor: '#0b1320' },
  webview: { flex: 1, backgroundColor: '#0b1320' },
  loadingContainer: { flex: 1, backgroundColor: '#0b1320', alignItems: 'center', justifyContent: 'center' },
  errorContainer: { flex: 1, backgroundColor: '#0b1320' }
});
