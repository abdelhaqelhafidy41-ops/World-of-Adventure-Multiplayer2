import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.worldofadventure.game',
  appName: 'World of Adventure',
  webDir: 'dist',
  backgroundColor: '#0d1712',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0d1712',
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
