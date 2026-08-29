import type { UserProfile } from '../types';
import demoData from './data.json';

/**
 * The demo attendee — resolved from the flat `people` list by `selectedPersonId`.
 * Change that id in data.json to preview the app as a different person.
 */
const person =
  demoData.people.find((p) => p.id === demoData.selectedPersonId) ?? demoData.people[0];

/**
 * Rehearsal hatch: `?perms=7` previews the app as someone also holding that
 * permission, so the honour marks can be seen without touching the roster.
 * Same idea as `bcn2026-demo-health` in demo/game. Staff always get 1 and 2 so
 * the demo can exercise the GM and global chat.
 */
function demoPermissions(): number[] {
  const granted = person.isManager ? [1, 2] : [];
  const raw = new URLSearchParams(window.location.search).get('perms');
  const extra = (raw ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  return [...new Set([...granted, ...extra])].sort((a, b) => a - b);
}

/** Mock attendee used when the app runs in demo mode (no backend session). */
export const DEMO_PROFILE: UserProfile = {
  id: person.id,
  name: person.name,
  phone: person.phone,
  churchName: person.churchName,
  teamCode: person.teamCode,
  roomNumber: person.roomNumber,
  // Leaders are the team's leaders; room-mates share the room number.
  leadersName: demoData.people
    .filter((p) => p.id !== person.id && p.teamCode === person.teamCode && p.isLeader)
    .map((p) => p.name),
  roommatesName: demoData.people
    .filter((p) => p.id !== person.id && p.roomNumber === person.roomNumber)
    .map((p) => p.name),
  isLeader: person.isLeader,
  isManager: person.isManager,
  permissions: demoPermissions(),
};
