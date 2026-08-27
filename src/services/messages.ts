import { config, isDemoMode } from '../config';
import { demoBoard, demoEditMessage, demoPostMessage } from '../demo';
import type { MessageScope, TeamMessage, TeamMessageBoard, UserProfile } from '../types';

/** The caller's team board, or the global one. Rights are resolved server-side. */
export async function fetchTeamMessages(
  profile: UserProfile,
  scope: MessageScope = 'team',
): Promise<TeamMessageBoard> {
  if (isDemoMode()) return demoBoard(profile, scope);

  const res = await fetch(
    `${config.apiBaseUrl}/messages?id=${encodeURIComponent(profile.id)}&scope=${scope}`,
  );
  if (!res.ok) throw new Error(`Messages API error: ${res.status}`);
  return res.json();
}

export async function postTeamMessage(
  profile: UserProfile,
  text: string,
  scope: MessageScope = 'team',
): Promise<TeamMessage> {
  if (isDemoMode()) return demoPostMessage(profile, text, scope);

  const res = await fetch(`${config.apiBaseUrl}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: profile.id, text, scope }),
  });
  if (!res.ok) throw new Error(`Messages API error: ${res.status}`);
  const data = await res.json();
  return data.message as TeamMessage;
}

/** Edits one of the caller's own messages; the backend rejects anyone else's. */
export async function editTeamMessage(
  profile: UserProfile,
  messageId: string,
  text: string,
  scope: MessageScope = 'team',
): Promise<TeamMessage> {
  if (isDemoMode()) return demoEditMessage(profile, messageId, text, scope);

  const res = await fetch(`${config.apiBaseUrl}/messages`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: profile.id, messageId, text, scope }),
  });
  if (!res.ok) throw new Error(`Messages API error: ${res.status}`);
  const data = await res.json();
  return data.message as TeamMessage;
}
