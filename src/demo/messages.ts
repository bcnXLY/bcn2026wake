import type { MessageScope, TeamMessage, TeamMessageBoard, UserProfile } from '../types';
import { PERM_GLOBAL_CHAT, hasPermission } from '../utils/permissions';
import demoData from './data.json';

type Person = (typeof demoData.people)[number];

const roleOf = (p: Person) => (p.isManager ? 8 : p.isLeader ? 1 : 0);

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/**
 * Boards live in memory for the session, so posting and deleting behave like the
 * real backend without one. Reloading the page resets them to the seed below.
 */
const boards = new Map<string, TeamMessage[]>();

const GLOBAL_BOARD = 'global';

function seedBoard(teamCode: string): TeamMessage[] {
  if (teamCode === GLOBAL_BOARD) {
    const staff = demoData.people.filter((p) => p.isManager);
    if (staff.length === 0) return [];
    return [
      {
        id: `${hoursAgo(6)}#demoglob1`,
        text: '全体注意：晚上 21:00 大堂集合，进行营会总结。',
        senderId: staff[0].id,
        senderName: staff[0].name,
        senderRole: roleOf(staff[0]),
        createdAt: hoursAgo(6),
      },
    ];
  }

  const leaders = demoData.people.filter((p) => p.teamCode === teamCode && p.isLeader);
  if (leaders.length === 0) return [];

  return [
    {
      id: `${hoursAgo(20)}#demo0001`,
      text: '明天早上 8:00 在大堂集合，请不要迟到。',
      senderId: leaders[0].id,
      senderName: leaders[0].name,
      senderRole: roleOf(leaders[0]),
      createdAt: hoursAgo(20),
    },
    {
      id: `${hoursAgo(3)}#demo0002`,
      text: '小组分享改到 B 教室，记得带笔记本。',
      senderId: leaders[leaders.length - 1].id,
      senderName: leaders[leaders.length - 1].name,
      senderRole: roleOf(leaders[leaders.length - 1]),
      createdAt: hoursAgo(3),
    },
  ];
}

function boardFor(teamCode: string): TeamMessage[] {
  let messages = boards.get(teamCode);
  if (!messages) {
    messages = seedBoard(teamCode);
    boards.set(teamCode, messages);
  }
  return messages;
}

/**
 * Staff sit on team 0, which the roster reports as a blank team code — they
 * still get a board, matching what the backend derives from `team_id`.
 */
const teamOf = (profile: UserProfile) =>
  profile.teamCode || (profile.isManager ? '0' : '');

const canPost = (profile: UserProfile) =>
  Boolean(teamOf(profile)) && (profile.isLeader || profile.isManager);

const boardOf = (profile: UserProfile, scope: MessageScope) =>
  scope === 'global' ? GLOBAL_BOARD : teamOf(profile);

const mayPost = (profile: UserProfile, scope: MessageScope) =>
  scope === 'global' ? hasPermission(profile, PERM_GLOBAL_CHAT) : canPost(profile);

export function demoBoard(profile: UserProfile, scope: MessageScope = 'team'): TeamMessageBoard {
  const teamCode = boardOf(profile, scope);
  if (!teamCode) return { teamCode: '', canPost: false, messages: [] };
  return {
    teamCode,
    canPost: mayPost(profile, scope),
    messages: [...boardFor(teamCode)],
  };
}

export function demoPostMessage(
  profile: UserProfile,
  text: string,
  scope: MessageScope = 'team',
): TeamMessage {
  const teamCode = boardOf(profile, scope);
  const createdAt = new Date().toISOString();
  const message: TeamMessage = {
    id: `${createdAt}#${Math.random().toString(16).slice(2, 10)}`,
    text,
    senderId: profile.id,
    senderName: profile.name,
    senderRole: profile.isManager ? 8 : profile.isLeader ? 1 : 0,
    createdAt,
  };
  boardFor(teamCode).push(message);
  return message;
}

export function demoDeleteMessage(
  profile: UserProfile,
  messageId: string,
  scope: MessageScope = 'team',
): void {
  const messages = boardFor(boardOf(profile, scope));
  const index = messages.findIndex((m) => m.id === messageId && m.senderId === profile.id);
  if (index === -1) throw new Error('Message not found');
  messages.splice(index, 1);
}
