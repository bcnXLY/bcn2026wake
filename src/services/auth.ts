import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { config } from '../config';
import type { UserProfile } from '../types';

const userPool = new CognitoUserPool({
  // Fallback placeholders keep the constructor happy in demo mode (unused there).
  UserPoolId: config.aws.userPoolId || 'us-east-1_000000000',
  ClientId: config.aws.clientId || '0000000000000000000000000',
});

export type OtpChannel = 'email' | 'sms';

export interface ChannelInfo {
  available: boolean;
  hint?: string;
}

export interface LoginChannels {
  channels: Record<OtpChannel, ChannelInfo>;
}

export class AuthError extends Error {
  /** Seconds to wait before retrying, set on rate-limit ('cooldown') errors. */
  retryAfter?: number;
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

function cognitoUser(username: string): CognitoUser {
  return new CognitoUser({ Username: username, Pool: userPool });
}

/** Parses a "COOLDOWN:<seconds>" message thrown by the CreateAuthChallenge trigger. */
function cooldownFrom(message?: string): number | null {
  const m = message?.match(/COOLDOWN:(\d+)/);
  return m ? Number(m[1]) : null;
}

// The pending passwordless session lives between requesting and answering the OTP.
let pendingUser: CognitoUser | null = null;
let pendingChannel: OtpChannel = 'email';

/**
 * Fetches which OTP channels the roster user can pick (with masked hints).
 * Also serves as the "is this ID on the roster?" check (404 → unknownId).
 */
export async function getLoginChannels(id: string): Promise<LoginChannels> {
  const res = await fetch(`${config.apiBaseUrl}/login/channels?id=${encodeURIComponent(id)}`);
  if (res.status === 404) throw new AuthError('unknownId');
  if (!res.ok) throw new AuthError('generic');
  return res.json();
}

/**
 * Passwordless step 1 — start a Cognito CUSTOM_AUTH flow. This triggers the
 * CreateAuthChallenge Lambda, which sends the OTP on the chosen channel. The
 * promise resolves once the challenge is presented (i.e. the code is on its way).
 * A server-side cooldown may reject with an AuthError('cooldown', retryAfter).
 */
export function startLogin(id: string, channel: OtpChannel): Promise<void> {
  const user = cognitoUser(id);
  user.setAuthenticationFlowType('CUSTOM_AUTH');
  pendingUser = user;
  pendingChannel = channel;
  const details = new AuthenticationDetails({
    Username: id,
    ClientMetadata: { channel },
  });

  return new Promise((resolve, reject) => {
    user.initiateAuth(details, {
      // Won't fire before the challenge is answered, but handle defensively.
      onSuccess: () => resolve(),
      customChallenge: () => resolve(),
      onFailure: (err) => {
        const cd = cooldownFrom(err?.message);
        if (cd !== null) {
          const e = new AuthError('cooldown');
          e.retryAfter = cd;
          reject(e);
        } else if (err?.code === 'UserNotFoundException') {
          reject(new AuthError('unknownId'));
        } else {
          reject(new AuthError('generic', err?.message));
        }
      },
    });
  });
}

/**
 * Passwordless step 2 — submit the 6-digit code. On success Cognito issues JWTs
 * (cached in localStorage by the SDK) and the session is returned. A wrong code
 * re-presents the challenge (Cognito allows a few tries) → AuthError('invalidCode').
 */
export function submitOtp(code: string): Promise<CognitoUserSession> {
  if (!pendingUser) return Promise.reject(new AuthError('generic'));
  const user = pendingUser;
  return new Promise((resolve, reject) => {
    user.sendCustomChallengeAnswer(
      code,
      {
        onSuccess: (session) => {
          pendingUser = null;
          resolve(session);
        },
        // Re-presented challenge = the code was wrong, attempts remaining.
        customChallenge: () => reject(new AuthError('invalidCode')),
        onFailure: (err) => {
          // Runs out of attempts → Cognito fails the whole flow.
          pendingUser = null;
          reject(new AuthError('invalidCode', err?.message));
        },
      },
      { channel: pendingChannel },
    );
  });
}

export function getCurrentSession(): Promise<CognitoUserSession | null> {
  const user = userPool.getCurrentUser();
  if (!user) return Promise.resolve(null);
  return new Promise((resolve) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) resolve(null);
      else resolve(session);
    });
  });
}

export function signOut(): void {
  userPool.getCurrentUser()?.signOut();
}

/** Extracts the attendee profile from the ID token claims (populated by seed). */
export function profileFromSession(session: CognitoUserSession): UserProfile {
  const c = session.getIdToken().decodePayload() as Record<string, unknown>;
  const rawLinks = c['custom:links'];
  let links: UserProfile['links'] = [];
  if (typeof rawLinks === 'string' && rawLinks.trim()) {
    try {
      links = JSON.parse(rawLinks);
    } catch {
      links = [];
    }
  }
  return {
    id: String(c['cognito:username'] ?? c['sub'] ?? ''),
    name: String(c['name'] ?? ''),
    email: String(c['email'] ?? ''),
    phone: String(c['phone_number'] ?? ''),
    teamName: String(c['custom:team_name'] ?? ''),
    links,
  };
}

export function getIdToken(session: CognitoUserSession): string {
  return session.getIdToken().getJwtToken();
}
