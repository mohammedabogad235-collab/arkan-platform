import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arkan.app',
  appName: 'ARKAN.APP',
  webDir: 'artifacts/website-builder/dist',
  server: {
    cleartext: true,
  },
  plugins: {
    // iOS uses presentationOptions; Android ignores safely. Kept here for completeness.
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
