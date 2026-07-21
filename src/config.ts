/**
 * Centralised runtime configuration.
 * All values are injected at build time from Vite env vars (see .env.example).
 * Only public / non-secret values live here — nothing exposed here can be used
 * to read anything the user could not already read.
 */
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  googleDrive: {
    apiKey: import.meta.env.VITE_GOOGLE_DRIVE_API_KEY,
    folderId: import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID,
  },
  oneSignalAppId: import.meta.env.VITE_ONESIGNAL_APP_ID,
  // Offline preview: bypasses the backend/Drive with mock data. Never true in prod.
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
  // Temporary escape hatch: defaults to enabled unless explicitly set to false.
  enableTestLoginButton: import.meta.env.VITE_ENABLE_TEST_LOGIN_BUTTON !== 'false',
} as const;

let runtimeDemo = config.demoMode;

export function isDemoMode(): boolean {
  return runtimeDemo;
}

export function enableDemoMode(): void {
  runtimeDemo = true;
}
