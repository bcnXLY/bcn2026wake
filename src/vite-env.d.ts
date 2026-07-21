/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_GOOGLE_DRIVE_API_KEY: string;
  readonly VITE_GOOGLE_DRIVE_FOLDER_ID: string;
  readonly VITE_ONESIGNAL_APP_ID: string;
  readonly VITE_DEMO_MODE: string;
  readonly VITE_ENABLE_TEST_LOGIN_BUTTON: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
