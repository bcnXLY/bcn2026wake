import type { ScheduleItem, EmergencyContact } from '../types';

/**
 * Event data is bundled as static content (edit + redeploy) to keep the
 * running cost at exactly $0. For a 1-week event this is simpler and cheaper
 * than a database read path. Times are ISO 8601 with an explicit offset.
 */
export const SCHEDULE: ScheduleItem[] = [
  {
    id: 's1',
    title: 'Registration & Welcome Coffee',
    location: 'Main Lobby',
    start: '2026-07-07T08:30:00+02:00',
    end: '2026-07-07T09:30:00+02:00',
  },
  {
    id: 's2',
    title: 'Opening Keynote',
    location: 'Auditorium A',
    start: '2026-07-07T09:30:00+02:00',
    end: '2026-07-07T10:30:00+02:00',
  },
  {
    id: 's3',
    title: 'Team Breakout Sessions',
    location: 'Rooms 1–6',
    start: '2026-07-07T11:00:00+02:00',
    end: '2026-07-07T13:00:00+02:00',
  },
  {
    id: 's4',
    title: 'Lunch',
    location: 'Terrace',
    start: '2026-07-07T13:00:00+02:00',
    end: '2026-07-07T14:30:00+02:00',
  },
  {
    id: 's5',
    title: 'Workshops',
    location: 'Innovation Hub',
    start: '2026-07-07T14:30:00+02:00',
    end: '2026-07-07T17:00:00+02:00',
  },
  {
    id: 's6',
    title: 'Evening Social',
    location: 'Rooftop Bar',
    start: '2026-07-07T19:30:00+02:00',
    end: '2026-07-07T22:00:00+02:00',
  },
];

export const EMERGENCY_CONTACTS: EmergencyContact[] = [
  { id: 'c1', name: 'Event Control Room', role: 'General assistance', phone: '+34600000001' },
  { id: 'c2', name: 'Medical / First Aid', role: 'On-site medic', phone: '+34600000002' },
  { id: 'c3', name: 'Security Desk', role: '24/7 security', phone: '+34600000003' },
  { id: 'c4', name: 'Transport Coordinator', role: 'Shuttles & taxis', phone: '+34600000004' },
  { id: 'c5', name: 'Local Emergency Services', role: 'Police / Ambulance', phone: '112' },
];
