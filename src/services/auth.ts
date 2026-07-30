import { config } from '../config';
import type { UserProfile } from '../types';

export class AuthError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

/**
 * Logs a participant in by their attendee ID. The backend looks the ID up in the
 * DynamoDB roster; if it exists the attendee profile is returned and access is
 * granted. A 404 means the ID is not on the roster.
 */
export async function login(id: string, code?: string): Promise<UserProfile | { requires2FA: true }> {
  const url = `${config.apiBaseUrl}/login?id=${encodeURIComponent(id)}${code ? `&code=${encodeURIComponent(code)}` : ''}`;
  const res = await fetch(url);
  if (res.status === 404) throw new AuthError('unknownId');
  if (res.status === 400) {
    const data = await res.json().catch(() => ({}));
    if (data.message === 'Phone number not registered. Please contact support.') {
        throw new AuthError('noPhoneRegistered');
    }
  }
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (data.message === 'Invalid code' || data.message === 'Code has expired') throw new AuthError('invalidCode');
    throw new AuthError('unauthorized');
  }
  if (!res.ok) throw new AuthError('genericError');
  const data = await res.json();
  if (data.requires2FA) {
    return { requires2FA: true };
  }
  return data.profile as UserProfile;
}

export async function updatePhone(id: string, phone: string): Promise<void> {
  const res = await fetch(`${config.apiBaseUrl}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, phone })
  });
  if (!res.ok) throw new AuthError('genericError');
}
