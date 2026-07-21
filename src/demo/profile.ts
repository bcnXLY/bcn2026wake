import type { UserProfile } from '../types';
import demoData from './data.json';

/**
 * The demo attendee — resolved from the flat `people` list by `selectedPersonId`.
 * Change that id in data.json to preview the app as a different person.
 */
const person =
  demoData.people.find((p) => p.id === demoData.selectedPersonId) ?? demoData.people[0];
const team = demoData.camp.teams.find((t) => t.code === person.teamCode);

/** Mock attendee used when the app runs in demo mode (no backend session). */
export const DEMO_PROFILE: UserProfile = {
  id: person.id,
  name: person.name,
  phone: person.phone,
  churchName: person.churchName,
  teamCode: person.teamCode,
  teamName: team?.name ?? '',
  roomNumber: person.roomNumber,
  // Leaders are the team's leaders; room-mates share the room number.
  leadersId: demoData.people
    .filter((p) => p.id !== person.id && p.teamCode === person.teamCode && p.isLeader)
    .map((p) => p.id),
  roommatesId: demoData.people
    .filter((p) => p.id !== person.id && p.roomNumber === person.roomNumber)
    .map((p) => p.id),
  isLeader: person.isLeader,
  isMaintainer: person.isMaintainer,
};
