import type { UserProfile } from '../types';

export const PERM_GLOBAL_CHAT = 1;
export const PERM_GAME_MASTER = 2;

/* ---- Honours: granted by hand, and worn on the profile ------------------- */

/** Earned at a separate event, and stacks with the field-game honours. */
export const PERM_OBSERVER = 6;
/** Finished at the top of the standings. */
export const PERM_WINNER = 7;
/** Gave the most of their own score back to the world. */
export const PERM_PROTECTOR = 8;

/** Which mark someone carries. See HonourMark. */
export type Honour = 'observer' | 'winner' | 'protector';

export function hasPermission(
  profile: UserProfile | null | undefined,
  permission: number,
): boolean {
  return Boolean(profile?.permissions?.includes(permission));
}

/** Any of them can be held at once, and all of them are worn. Permission order. */
export function honoursOf(profile: UserProfile | null | undefined): Honour[] {
  const honours: Honour[] = [];
  if (hasPermission(profile, PERM_OBSERVER)) honours.push('observer');
  if (hasPermission(profile, PERM_WINNER)) honours.push('winner');
  if (hasPermission(profile, PERM_PROTECTOR)) honours.push('protector');
  return honours;
}
