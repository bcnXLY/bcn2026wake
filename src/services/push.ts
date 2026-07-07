import { config } from '../config';

interface OneSignalApi {
  init: (opts: Record<string, unknown>) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  Notifications: {
    permission: boolean;
    requestPermission: () => Promise<void>;
  };
}

type OneSignalDeferredItem = (os: OneSignalApi) => void | Promise<void>;

declare global {
  interface Window {
    OneSignalDeferred?: OneSignalDeferredItem[];
  }
}

let initialised = false;

/** Boots the OneSignal Web SDK once. Safe to call multiple times. */
export function initPush(): void {
  if (initialised || !config.oneSignalAppId) return;
  initialised = true;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    await OneSignal.init({
      appId: config.oneSignalAppId,
      // Do not auto-prompt; we ask contextually with our own button.
      autoResubscribe: true,
      serviceWorkerParam: { scope: '/onesignal/' },
      serviceWorkerPath: '/onesignal/OneSignalSDKWorker.js',
    });
  });
}

/** Ties push subscription to the attendee ID for targeted broadcasts. */
export function identifyPushUser(attendeeId: string): void {
  window.OneSignalDeferred?.push(async (OneSignal) => {
    await OneSignal.login(attendeeId);
  });
}

export function requestPushPermission(): void {
  window.OneSignalDeferred?.push(async (OneSignal) => {
    await OneSignal.Notifications.requestPermission();
  });
}

export function logoutPush(): void {
  window.OneSignalDeferred?.push(async (OneSignal) => {
    await OneSignal.logout();
  });
}
