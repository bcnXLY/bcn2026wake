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
} as const;

export const LOGOUT = false;
