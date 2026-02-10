const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Agregamos 'wasm' a la lista de archivos que Metro debe reconocer como assets
config.resolver.assetExts.push('wasm');

module.exports = config;