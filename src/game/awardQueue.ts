import { submitAward } from '../services/game';
import type { AwardSource, QueuedAward, UserProfile } from '../types';

/**
 * The game master's outbox: written to localStorage on submit, drained when the
 * network returns. Every award carries a locally generated id, which is what
 * makes replaying safe — the backend applies each one once.
 */

const QUEUE_KEY = 'bcn2026-game-queue';
const MAX_QUEUE = 500;

type Listener = (queue: QueuedAward[]) => void;

let queue: QueuedAward[] = load();
let draining = false;
const listeners = new Set<Listener>();

function load(): QueuedAward[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedAward[]) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE)));
  } catch {
    /* Out of quota. */
  }
  listeners.forEach((listener) => listener(queue));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(queue);
  return () => listeners.delete(listener);
}

export function getQueue(): QueuedAward[] {
  return queue;
}

export function pendingCount(): number {
  return queue.filter((award) => award.status === 'pending' || award.status === 'sending')
    .length;
}

function newAwardId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function enqueue(input: {
  team: string;
  points: number;
  worldPoints: number;
  source: AwardSource;
}): QueuedAward {
  const award: QueuedAward = {
    awardId: newAwardId(),
    team: input.team,
    points: input.points,
    worldPoints: input.worldPoints,
    source: input.source,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
  };
  queue = [award, ...queue].slice(0, MAX_QUEUE);
  persist();
  return award;
}

export function resend(awardId: string) {
  const award = queue.find((entry) => entry.awardId === awardId);
  if (!award || award.status === 'rejected' || award.status === 'applied') return;
  award.status = 'pending';
  persist();
}

export function clearSettled() {
  queue = queue.filter(
    (award) => award.status === 'pending' || award.status === 'sending',
  );
  persist();
}

/**
 * Send everything outstanding, oldest first. A terminal rejection is recorded
 * and never retried; a network failure leaves the award pending.
 */
export async function drain(profile: UserProfile): Promise<void> {
  if (draining) return;
  draining = true;

  try {
    const outstanding = [...queue]
      .filter((award) => award.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const award of outstanding) {
      award.status = 'sending';
      award.attempts += 1;
      persist();

      const result = await submitAward(profile, award);

      if (result.ok) {
        award.status = 'applied';
      } else if (result.terminal) {
        award.status = 'rejected';
        award.reason = result.reason;
      } else {
        award.status = 'pending';
        persist();
        break;
      }
      persist();
    }
  } finally {
    draining = false;
  }
}
