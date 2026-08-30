import type { MealWave, ScheduleItem } from '../types';

const TZ = '+02:00';

function at(day: string, time: string): string {
  return `${day}T${time}:00${TZ}`;
}

interface MealWindow {
  id: string;
  day: string;
  times: [string, string, string];
  eatsFirst: 'A' | 'B';
  mealKey: string;
  groupKey: string;
  wholeKey: string;
}

const LUNCH = {
  times: ['13:00', '14:00', '15:00'] as [string, string, string],
  mealKey: 'schedule.activities.lunch',
  groupKey: 'schedule.activities.smallGroup',
  wholeKey: 'schedule.activities.groupLunch',
};

const DINNER = {
  times: ['18:00', '19:00', '20:00'] as [string, string, string],
  mealKey: 'schedule.activities.dinner',
  groupKey: 'schedule.activities.smallGroup',
  wholeKey: 'schedule.activities.groupDinner',
};

const BREAKFAST = {
  times: ['08:00', '08:45', '09:30'] as [string, string, string],
  mealKey: 'schedule.activities.breakfast',
  groupKey: 'schedule.activities.devotional',
  wholeKey: 'schedule.activities.breakfastDevotional',
};

const MEAL_WINDOWS: MealWindow[] = [
  { id: 'd1-lunch', day: '2026-08-31', eatsFirst: 'B', ...LUNCH },
  { id: 'd1-dinner', day: '2026-08-31', eatsFirst: 'B', ...DINNER },
  { id: 'd2-breakfast', day: '2026-09-01', eatsFirst: 'A', ...BREAKFAST },
  { id: 'd2-lunch', day: '2026-09-01', eatsFirst: 'B', ...LUNCH },
  { id: 'd2-dinner', day: '2026-09-01', eatsFirst: 'B', ...DINNER },
  { id: 'd3-breakfast', day: '2026-09-02', eatsFirst: 'A', ...BREAKFAST },
  { id: 'd3-lunch', day: '2026-09-02', eatsFirst: 'A', ...LUNCH },
  { id: 'd3-dinner', day: '2026-09-02', eatsFirst: 'B', ...DINNER },
  { id: 'd4-breakfast', day: '2026-09-03', eatsFirst: 'A', ...BREAKFAST },
];

/** One window becomes five slots: a meal and a group half for each wave, plus
 *  the undivided window for everyone who is not in the rotation. */
function halves(w: MealWindow): ScheduleItem[] {
  const [open, swap, close] = w.times;
  const eatsSecond: MealWave = w.eatsFirst === 'A' ? 'B' : 'A';
  return [
    { id: `${w.id}-1-meal`, titleKey: w.mealKey, start: at(w.day, open), end: at(w.day, swap), wave: w.eatsFirst },
    { id: `${w.id}-1-group`, titleKey: w.groupKey, start: at(w.day, open), end: at(w.day, swap), wave: eatsSecond },
    { id: `${w.id}-2-meal`, titleKey: w.mealKey, start: at(w.day, swap), end: at(w.day, close), wave: eatsSecond },
    { id: `${w.id}-2-group`, titleKey: w.groupKey, start: at(w.day, swap), end: at(w.day, close), wave: w.eatsFirst },
    { id: `${w.id}-all`, titleKey: w.wholeKey, start: at(w.day, open), end: at(w.day, close), wave: 'none' },
  ];
}

/** Everything outside the meal rotation — the same for every attendee. */
const PLENARY: ScheduleItem[] = [
  // ── Monday 31 August ──────────────────────────────────────────────────────
  { id: 'd1-departure', titleKey: 'schedule.activities.departure', start: at('2026-08-31', '08:00'), end: at('2026-08-31', '11:30') },
  { id: 'd1-another-view', titleKey: 'schedule.activities.anotherView', start: at('2026-08-31', '11:30'), end: at('2026-08-31', '13:00') },
  { id: 'd1-worship-am', titleKey: 'schedule.activities.worship', start: at('2026-08-31', '15:00'), end: at('2026-08-31', '15:30') },
  { id: 'd1-opening', titleKey: 'schedule.activities.opening', start: at('2026-08-31', '15:30'), end: at('2026-08-31', '16:30') },
  { id: 'd1-team-formation', titleKey: 'schedule.activities.teamFormation', start: at('2026-08-31', '16:30'), end: at('2026-08-31', '18:00') },
  { id: 'd1-worship-pm', titleKey: 'schedule.activities.worship', start: at('2026-08-31', '20:00'), end: at('2026-08-31', '20:30') },
  { id: 'd1-message', titleKey: 'schedule.activities.message1', start: at('2026-08-31', '20:30'), end: at('2026-08-31', '21:30') },
  { id: 'd1-free-time', titleKey: 'schedule.activities.freeTime', start: at('2026-08-31', '21:30'), end: at('2026-08-31', '22:30') },

  // ── Tuesday 1 September ───────────────────────────────────────────────────
  { id: 'd2-retracing', titleKey: 'schedule.activities.retracing', start: at('2026-09-01', '09:30'), end: at('2026-09-01', '10:30') },
  { id: 'd2-worship-am', titleKey: 'schedule.activities.worship', start: at('2026-09-01', '10:30'), end: at('2026-09-01', '11:00') },
  { id: 'd2-message-am', titleKey: 'schedule.activities.message2', start: at('2026-09-01', '11:00'), end: at('2026-09-01', '12:00') },
  { id: 'd2-finite-one', titleKey: 'schedule.activities.finiteOne', start: at('2026-09-30', '15:00'), end: at('2026-09-01', '18:00') },
  { id: 'd2-worship-pm', titleKey: 'schedule.activities.worship', start: at('2026-09-01', '20:00'), end: at('2026-09-01', '20:30') },
  { id: 'd2-message-pm', titleKey: 'schedule.activities.message3', start: at('2026-09-01', '20:30'), end: at('2026-09-01', '21:30') },
  { id: 'd2-what-matters', titleKey: 'schedule.activities.whatMatters', start: at('2026-09-01', '21:30'), end: at('2026-09-01', '22:30') },

  // ── Wednesday 2 September ─────────────────────────────────────────────────
  { id: 'd3-unfinished', titleKey: 'schedule.activities.unfinished', start: at('2026-09-02', '09:30'), end: at('2026-09-02', '10:30') },
  { id: 'd3-worship-am', titleKey: 'schedule.activities.worship', start: at('2026-09-02', '10:30'), end: at('2026-09-02', '11:00') },
  { id: 'd3-message-am', titleKey: 'schedule.activities.message4', start: at('2026-09-02', '11:00'), end: at('2026-09-02', '12:00') },
  { id: 'd3-workshops', titleKey: 'schedule.activities.workshops', start: at('2026-09-02', '15:00'), end: at('2026-09-02', '18:00') },
  { id: 'd3-worship-pm', titleKey: 'schedule.activities.worship', start: at('2026-09-02', '20:00'), end: at('2026-09-02', '20:30') },
  { id: 'd3-message-pm', titleKey: 'schedule.activities.message5', start: at('2026-09-02', '20:30'), end: at('2026-09-02', '21:30') },
  { id: 'd3-prayer-night', titleKey: 'schedule.activities.prayerNight', start: at('2026-09-02', '21:30'), end: at('2026-09-02', '23:00') },

  // ── Thursday 3 September ──────────────────────────────────────────────────
  { id: 'd4-worship-am', titleKey: 'schedule.activities.worship', start: at('2026-09-03', '09:30'), end: at('2026-09-03', '10:00') },
  { id: 'd4-qanda', titleKey: 'schedule.activities.qanda', start: at('2026-09-03', '10:00'), end: at('2026-09-03', '11:30') },
  { id: 'd4-small-group', titleKey: 'schedule.activities.smallGroup', start: at('2026-09-03', '11:30'), end: at('2026-09-03', '12:30') },
  { id: 'd4-worship-noon', titleKey: 'schedule.activities.worship', start: at('2026-09-03', '12:30'), end: at('2026-09-03', '13:00') },
  { id: 'd4-closing', titleKey: 'schedule.activities.closing', start: at('2026-09-03', '13:00'), end: at('2026-09-03', '14:30') },
  { id: 'd4-lunch', titleKey: 'schedule.activities.lunch', start: at('2026-09-03', '14:30'), end: at('2026-09-03', '16:30') },
];

export const SCHEDULE: ScheduleItem[] = [
  ...PLENARY,
  ...MEAL_WINDOWS.flatMap(halves),
].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
