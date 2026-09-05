import { config } from '../config';
import type { MessageScope, TeamMessage, TeamMessageBoard, UserProfile } from '../types';

/** The caller's team board, their room board, or the global one. Rights are resolved server-side. */
export async function fetchTeamMessages(
  profile: UserProfile,
  scope: MessageScope = 'team',
): Promise<TeamMessageBoard> {
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
  const res = await fetch(`${config.apiBaseUrl}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: profile.id, text, scope }),
  });
  if (!res.ok) throw new Error(`Messages API error: ${res.status}`);
  const data = await res.json();
  return data.message as TeamMessage;
}

/** Deletes one of the caller's own messages; the backend rejects anyone else's. */
export async function deleteTeamMessage(
  profile: UserProfile,
  messageId: string,
  scope: MessageScope = 'team',
): Promise<void> {
  const query = new URLSearchParams({ id: profile.id, messageId, scope });
  const res = await fetch(`${config.apiBaseUrl}/messages?${query}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Messages API error: ${res.status}`);
}
