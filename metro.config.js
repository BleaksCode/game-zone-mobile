const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro'); // Falta esta importación vital

const config = getDefaultConfig(__dirname);

// 1. Configuración de WASM
// Nos aseguramos de sacar 'wasm' de sourceExts si existiera y moverlo a assetExts
const { transformer, resolver } = config;
config.resolver = {
  ...resolver,
  assetExts: [...resolver.assetExts, 'wasm'], // Agrega wasm a los assets
};

config.resolver.sourceExts.push('sql');

// 2. Configuración de NativeWind
// IMPORTANTE: Asegúrate de exportar el resultado de esta función, no la 'config' original.
module.exports = withNativeWind(config, { 
  input: './global.css', // Asegúrate de que este archivo exista en la raíz o ajusta la ruta (ej: './src/global.css')
  inlineRem: 16, 
});