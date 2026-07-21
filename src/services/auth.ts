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
export async function login(id: string): Promise<UserProfile> {
  const res = await fetch(`${config.apiBaseUrl}/login?id=${encodeURIComponent(id)}`);
  if (res.status === 404) throw new AuthError('unknownId');
  if (!res.ok) throw new AuthError('genericError');
  const data = await res.json();
  return data.profile as UserProfile;
}
