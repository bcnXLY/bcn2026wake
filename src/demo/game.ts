import type {
  AwardResult,
  GameState,
  QueuedAward,
  ServerAward,
  UserProfile,
} from '../types';
import demoData from './data.json';

/**
 * A whole game in memory, so the screens can be rehearsed without AWS. Mirrors
 * the backend's rules rather than pretending everything succeeds.
 */

const DEMO_TEAMS = 30;
const DEMO_PACE = 1.2;
const MAX_HEALTH = 100;

const scores = new Map<string, number>(
  Array.from({ length: DEMO_TEAMS }, (_, i) => [
    String(i + 1),
    40 + ((i * 137) % 260),
  ]),
);

/**
 * Rehearsal hatch: `localStorage['bcn2026-demo-health'] = '8'` starts the demo
 * anywhere on the curve, so the late states can be seen without waiting an hour.
 */
function startingHealth(): number {
  const raw = Number(localStorage.getItem('bcn2026-demo-health'));
  return Number.isFinite(raw) && raw >= 0 && raw <= MAX_HEALTH ? raw : 82;
}

let health = startingHealth();
let lastTick = Date.now();
let status: GameState['status'] = health > 0 ? 'running' : 'ended';
const history: ServerAward[] = [];

function projectHealth(): number {
  const now = Date.now();
  if (status === 'running') {
    const elapsedMinutes = (now - lastTick) / 60_000;
    health = Math.min(MAX_HEALTH, Math.max(0, health - DEMO_PACE * elapsedMinutes));
    lastTick = now;
    if (health <= 0) status = 'ended';
  }
  return health;
}

function roleOf(profile: UserProfile): number {
  if (profile.role != null) return profile.role;
  if (profile.isManager) return 8;
  if (profile.isLeader) return 1;
  return 0;
}

function leaderboard() {
  const rows = [...scores.entries()].sort(
    (a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]),
  );

  let sharedRank = 0;
  let previous: number | null = null;
  return rows.map(([team, score], index) => {
    if (score !== previous) {
      sharedRank = index + 1;
      previous = score;
    }
    return { rank: sharedRank, team };
  });
}

export async function demoFetchGameState(profile: UserProfile): Promise<GameState> {
  const role = roleOf(profile);
  const team = profile.teamCode;
  const isPlayer = (role === 0 || role === 1) && Boolean(team) && scores.has(team);

  const state: GameState = {
    status,
    worldHealth: Number(projectHealth().toFixed(1)),
    view: role === 8 ? 'gm' : isPlayer ? 'player' : 'spectator',
    leaderboard: leaderboard(),
  };

  if (state.view === 'player') {
    state.team = team;
    state.teamPoints = scores.get(team) ?? 0;
  }
  if (state.view === 'gm') {
    state.teams = [...scores.keys()].sort((a, b) => Number(a) - Number(b));
    state.limits = { points: 1000, worldPoints: 25 };
  }
  return state;
}

export async function demoSubmitAward(award: QueuedAward): Promise<AwardResult> {
  if (history.some((entry) => entry.awardId === award.awardId)) {
    return { ok: true, duplicate: true };
  }
  if (status !== 'running') {
    record(award, 'rejected', 'not_running');
    return { ok: false, terminal: true, reason: 'not_running' };
  }

  const current = scores.get(award.team);
  if (current === undefined) {
    record(award, 'rejected', 'invalid_team');
    return { ok: false, terminal: true, reason: 'invalid_team' };
  }
  if (award.points < 0 && current < -award.points) {
    record(award, 'rejected', 'insufficient_points');
    return { ok: false, terminal: true, reason: 'insufficient_points' };
  }

  scores.set(award.team, current + award.points);
  if (award.worldPoints > 0) {
    projectHealth();
    health = Math.min(MAX_HEALTH, health + award.worldPoints);
  }
  record(award, 'applied');
  return { ok: true, duplicate: false };
}

function record(award: QueuedAward, state: 'applied' | 'rejected', reason?: string) {
  const gm = demoData.people.find((p) => p.isManager) ?? demoData.people[0];
  history.unshift({
    awardId: award.awardId,
    team: award.team,
    points: award.points,
    worldPoints: award.worldPoints,
    gmId: gm.id,
    gmName: gm.name,
    source: award.source,
    createdAt: award.createdAt,
    receivedAt: Date.now(),
    status: state,
    ...(reason ? { reason } : {}),
  });
}

export async function demoHistory(): Promise<ServerAward[]> {
  return history.slice(0, 50);
}
