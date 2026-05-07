const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Treat the Vite-built single-file HTML as a bundleable asset so we can
// require('./dist/index.html') from App.tsx.
config.resolver.assetExts.push('html');
config.resolver.assetExts.push('webmanifest');

module.exports = config;
