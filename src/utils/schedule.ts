import { SCHEDULE } from '../data/eventData';
import type { ScheduleItem, UserProfile } from '../types';

/** Role codes that the app itself reasons about; the rest are staff groups. */
export const ROLE_MEMBER = 0;
export const ROLE_LEADER = 1;
export const ROLE_MAINTAINER = 8;

/**
 * The attendee's numeric role. Profiles saved before the backend started
 * sending `role` only carry the two booleans, so derive it from those.
 */
export function roleIdOf(profile: UserProfile | null | undefined): number {
  if (!profile) return ROLE_MEMBER;
  if (profile.role != null) return profile.role;
  if (profile.isManager) return ROLE_MAINTAINER;
  if (profile.isLeader) return ROLE_LEADER;
  return ROLE_MEMBER;
}

/** An activity with no `roleIds` is for everyone; otherwise it is opt-in. */
export function isVisibleTo(item: ScheduleItem, roleId: number): boolean {
  return !item.roleIds?.length || item.roleIds.includes(roleId);
}

/** The activities this role is allowed to see, in chronological order. */
export function scheduleFor(roleId: number): ScheduleItem[] {
  return SCHEDULE.filter((item) => isVisibleTo(item, roleId)).sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
}

/** The activity running right now, if any. */
export function currentActivity(items: ScheduleItem[], now: number): ScheduleItem | null {
  return (
    items.find(
      (item) => now >= new Date(item.start).getTime() && now < new Date(item.end).getTime(),
    ) ?? null
  );
}

/** The soonest activity that has not started yet. */
export function nextActivity(items: ScheduleItem[], now: number): ScheduleItem | null {
  let soonest: ScheduleItem | null = null;
  let soonestStart = Infinity;
  for (const item of items) {
    const start = new Date(item.start).getTime();
    if (start > now && start < soonestStart) {
      soonest = item;
      soonestStart = start;
    }
  }
  return soonest;
}

/** Opens "The Finite ONE", and only while it is the running activity. */
export const FIELD_GAMES_EVENT_ID = 's18';

export function isFieldGamesNow(now: number): boolean {
  const item = SCHEDULE.find((i) => i.id === FIELD_GAMES_EVENT_ID);
  if (!item) return false;
  return now >= new Date(item.start).getTime() && now < new Date(item.end).getTime();
}

/**
 * Team leaders are a surprise until this activity is over — until then their
 * names are held back on the profile and contacts tabs.
 */
export const LEADER_REVEAL_EVENT_ID = 's1';

export function leadersRevealed(now: number): boolean {
  const item = SCHEDULE.find((i) => i.id === LEADER_REVEAL_EVENT_ID);
  if (!item) return true;
  return now >= new Date(item.end).getTime();
}
