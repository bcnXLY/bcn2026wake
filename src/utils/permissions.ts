import type { UserProfile } from '../types';

export const PERM_GLOBAL_CHAT = 1;
export const PERM_GAME_MASTER = 2;

export function hasPermission(profile: UserProfile | null, permission: number): boolean {
  return Boolean(profile?.permissions?.includes(permission));
}
