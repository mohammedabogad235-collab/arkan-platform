import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arkan.app',
  appName: 'ARKAN.APP',
  webDir: 'artifacts/website-builder/dist',
  server: {
    cleartext: true,
  },
};

export default config;
