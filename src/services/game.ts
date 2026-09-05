import { config } from '../config';
import type {
  AwardResult,
  GameState,
  QueuedAward,
  ServerAward,
  UserProfile,
} from '../types';

export async function fetchGameState(profile: UserProfile): Promise<GameState> {
  const res = await fetch(`${config.apiBaseUrl}/game?id=${encodeURIComponent(profile.id)}`);
  if (!res.ok) throw new Error(`Game API error: ${res.status}`);
  return res.json();
}

/**
 * Never throws: the caller is a queue that needs to know whether to retry. A
 * 4xx is the backend's judgement and must not be retried; anything else is.
 */
export async function submitAward(
  profile: UserProfile,
  award: QueuedAward,
): Promise<AwardResult> {
  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}/game/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: profile.id,
        awardId: award.awardId,
        team: award.team,
        points: award.points,
        worldPoints: award.worldPoints,
        source: award.source,
        createdAt: award.createdAt,
      }),
    });
  } catch {
    return { ok: false, terminal: false };
  }

  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: true, duplicate: Boolean(data.duplicate) };
  }

  if (res.status >= 400 && res.status < 500) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, terminal: true, reason: data.reason || `http_${res.status}` };
  }

  return { ok: false, terminal: false };
}

export async function fetchAwardHistory(profile: UserProfile): Promise<ServerAward[]> {
  const res = await fetch(
    `${config.apiBaseUrl}/game/awards?id=${encodeURIComponent(profile.id)}`,
  );
  if (!res.ok) throw new Error(`Game API error: ${res.status}`);
  const data = await res.json();
  return (data.awards ?? []) as ServerAward[];
}
