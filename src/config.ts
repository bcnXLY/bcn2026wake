/**
 * Centralised runtime configuration.
 * All values are injected at build time from Vite env vars (see .env.example).
 * Only public / non-secret values live here — nothing exposed here can be used
 * to bypass Cognito or read anything the user could not already read.
 */
export const config = {
  aws: {
    region: import.meta.env.VITE_AWS_REGION,
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  },
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  googleDrive: {
    apiKey: import.meta.env.VITE_GOOGLE_DRIVE_API_KEY,
    folderId: import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID,
  },
  oneSignalAppId: import.meta.env.VITE_ONESIGNAL_APP_ID,
  // Offline preview: bypasses Cognito/Drive with mock data. Never true in prod.
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
} as const;
