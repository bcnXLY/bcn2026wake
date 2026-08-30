import { config, isDemoMode } from '../config';
import { DEMO_PROFILE } from '../demo';
import type { DocumentField, UserProfile } from '../types';

export class AuthError extends Error {
  constructor(
    public code: string,
    message?: string,
    /** Set on a rejected ID card value, so the form can point at it. */
    public field?: DocumentField,
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
const KNOWN_ERROR_CODES = new Set([
  'unknownId',
  'noPhoneRegistered',
  'invalidCode',
  'tooManyAttempts',
  'smsFailed',
  'unauthorized',
]);

export async function login(id: string, code?: string): Promise<UserProfile | { requires2FA: true }> {
  const url = `${config.apiBaseUrl}/login?id=${encodeURIComponent(id)}${code ? `&code=${encodeURIComponent(code)}` : ''}`;
  const res = await fetch(url);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { code?: string });
    if (data.code && KNOWN_ERROR_CODES.has(data.code)) throw new AuthError(data.code);
    if (res.status === 404) throw new AuthError('unknownId');
    if (res.status === 401) throw new AuthError('unauthorized');
    throw new AuthError('genericError');
  }

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

/**
 * Which ID card details the roster still lacks for this attendee. Only the list
 * of field names comes back — never the values already on file.
 */
export async function fetchMissingDocumentFields(id: string): Promise<DocumentField[]> {
  if (isDemoMode()) return DEMO_PROFILE.missingDocumentFields ?? [];

  const res = await fetch(`${config.apiBaseUrl}/profile?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new AuthError(res.status === 404 ? 'unknownId' : 'genericError');
  const data = await res.json();
  return (data.missingDocumentFields ?? []) as DocumentField[];
}

/** Saves the details the attendee typed. Returns whatever is still missing after. */
export async function submitDocumentFields(
  id: string,
  values: Partial<Record<DocumentField, string>>,
): Promise<DocumentField[]> {
  if (isDemoMode()) return [];

  const res = await fetch(`${config.apiBaseUrl}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...values }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { code?: string; field?: DocumentField });
    if (data.code === 'invalidDocument') throw new AuthError('invalidDocument', undefined, data.field);
    throw new AuthError('genericError');
  }

  const data = await res.json();
  return (data.missingDocumentFields ?? []) as DocumentField[];
}
