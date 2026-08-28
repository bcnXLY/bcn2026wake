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

/** Keeps a room board from colliding with the team board of the same number. */
const ROOM_BOARD_PREFIX = 'room-';

function seedBoard(boardId: string): TeamMessage[] {
  if (boardId.startsWith(ROOM_BOARD_PREFIX)) {
    return seedRoomBoard(boardId.slice(ROOM_BOARD_PREFIX.length));
  }

  if (boardId === GLOBAL_BOARD) {
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

  const leaders = demoData.people.filter((p) => p.teamCode === boardId && p.isLeader);
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

function seedRoomBoard(roomNumber: string): TeamMessage[] {
  const roommates = demoData.people.filter((p) => p.roomNumber === roomNumber);
  if (roommates.length === 0) return [];

  return [
    {
      id: `${hoursAgo(4)}#demoroom1`,
      text: '我把房卡放在门口的桌子上了，先出去一下。',
      senderId: roommates[0].id,
      senderName: roommates[0].name,
      senderRole: roleOf(roommates[0]),
      createdAt: hoursAgo(4),
    },
    {
      id: `${hoursAgo(1)}#demoroom2`,
      text: '收到，晚上谁最后回房记得关阳台的窗。',
      senderId: roommates[roommates.length - 1].id,
      senderName: roommates[roommates.length - 1].name,
      senderRole: roleOf(roommates[roommates.length - 1]),
      createdAt: hoursAgo(1),
    },
  ];
}

function boardFor(boardId: string): TeamMessage[] {
  let messages = boards.get(boardId);
  if (!messages) {
    messages = seedBoard(boardId);
    boards.set(boardId, messages);
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

/** Room 0 is the roster's "no room yet" placeholder, so it gets no board. */
const roomOf = (profile: UserProfile) =>
  profile.roomNumber && profile.roomNumber !== '0' ? profile.roomNumber : '';

const boardOf = (profile: UserProfile, scope: MessageScope) => {
  if (scope === 'global') return GLOBAL_BOARD;
  if (scope === 'room') {
    const room = roomOf(profile);
    return room ? ROOM_BOARD_PREFIX + room : '';
  }
  return teamOf(profile);
};

/** What the board is called in the UI — the room board answers with its number. */
const codeOf = (profile: UserProfile, scope: MessageScope) =>
  scope === 'room' ? roomOf(profile) : boardOf(profile, scope);

const mayPost = (profile: UserProfile, scope: MessageScope) => {
  if (scope === 'global') return hasPermission(profile, PERM_GLOBAL_CHAT);
  // Everyone in the room writes on the room board.
  if (scope === 'room') return Boolean(roomOf(profile));
  return canPost(profile);
};

export function demoBoard(profile: UserProfile, scope: MessageScope = 'team'): TeamMessageBoard {
  const boardId = boardOf(profile, scope);
  if (!boardId) return { teamCode: '', canPost: false, messages: [] };
  return {
    teamCode: codeOf(profile, scope),
    canPost: mayPost(profile, scope),
    messages: [...boardFor(boardId)],
  };
}

export function demoPostMessage(
  profile: UserProfile,
  text: string,
  scope: MessageScope = 'team',
): TeamMessage {
  const boardId = boardOf(profile, scope);
  const createdAt = new Date().toISOString();
  const message: TeamMessage = {
    id: `${createdAt}#${Math.random().toString(16).slice(2, 10)}`,
    text,
    senderId: profile.id,
    senderName: profile.name,
    senderRole: profile.isManager ? 8 : profile.isLeader ? 1 : 0,
    createdAt,
  };
  boardFor(boardId).push(message);
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
