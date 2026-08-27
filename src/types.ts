export interface UserProfile {
  id: string; // attendee ID (roster / participant ID)
  name: string;
  phone: string;
  churchName: string;
  teamCode: string;
  roomNumber: string;
  leadersName: string[];
  roommatesName: string[];
  isLeader: boolean;
  isManager: boolean;
  role?: number;
  permissions?: number[];
}

export interface ScheduleItem {
  id: string;
  /** i18n key resolving to the activity title. */
  titleKey: string;
  /** i18n key resolving to the activity location. */
  locationKey?: string;
  /** ISO 8601 start/end timestamps. */
  start: string;
  end: string;
  roleIds?: number[];
}

export interface EmergencyContact {
  id: string;
  /** i18n key resolving to the contact name. */
  nameKey: string;
  /** i18n key resolving to the contact role. */
  roleKey?: string;
  phone: string;
}

/** A person surfaced in the role-based contact directory (from DynamoDB). */
export interface DirectoryPerson {
  id: string;
  name: string;
  phone: string;
  roomNumber?: string;
  /** Numeric role code (0 = member, 1 = leader, 2+ = staff) for i18n display. */
  role?: number;
  isLeader?: boolean;
  isManager?: boolean;
  /** Set on the maintainer roster so each entry shows its group. */
  teamCode?: string;
}

/** A group of attendees (one team), used for the maintainer view. */
export interface DirectoryGroup {
  teamCode: string;
  members: DirectoryPerson[];
}

/**
 * Role-based contact directory returned by GET /contacts. The caller's role is
 * derived server-side from their roster record — never trusted from the client.
 */
export interface ContactsDirectory {
  role: 'member' | 'leader' | 'maintainer';
  /** member → their leaders; leader → their group members. */
  people?: DirectoryPerson[];
  /** maintainer → every group's members. */
  groups?: DirectoryGroup[];
  /** maintainer → the maintainer roster, each tagged with its group. */
  maintainers?: DirectoryPerson[];
  /** everyone → the caller's room-mates (from roommates_id). */
  roommates?: DirectoryPerson[];
  /** everyone → the emergency contacts (role 6). */
  emergencyContacts?: DirectoryPerson[];
}

/** One post on a team's announcement board (from DynamoDB). */
export interface TeamMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  /** Numeric role code of the sender, shown next to their name. */
  senderRole: number;
  createdAt: string;
  /** Only present once the author has edited the message. */
  updatedAt?: string;
}

/** Which board is being read: the caller's own team, or the event-wide one. */
export type MessageScope = 'team' | 'global';

/**
 * A board as returned by GET /messages. The caller's team and posting rights are
 * derived server-side from their roster record — never trusted from the client.
 */
export interface TeamMessageBoard {
  teamCode: string;
  /** Members (role 0) read only; everyone else on the team may post. */
  canPost: boolean;
  messages: TeamMessage[];
}

export interface GalleryImage {
  id: string;
  name: string;
  thumbnailUrl: string;
  fullUrl: string;
  webViewLink: string;
  downloadUrl: string;
}

export interface GalleryAlbum {
  id: string;
  name: string;
  coverUrl?: string;
}

export type TabKey = 'profile' | 'schedule' | 'messages' | 'gallery' | 'contacts';

/* ---- "The Finite ONE" (field games) ------------------------------------ */

export type GameStatus = 'idle' | 'running' | 'ended';

/** Resolved server-side from the caller's roster row. */
export type GameView = 'player' | 'spectator' | 'gm';

/** Deliberately carries no points. */
export interface LeaderboardEntry {
  rank: number;
  team: string;
}

export interface GameState {
  status: GameStatus;
  /** 0–100. The decay pace behind it is never sent. */
  worldHealth: number;
  view: GameView;
  leaderboard: LeaderboardEntry[];
  /** Players only. */
  team?: string;
  /** Players only — no other team's points are ever sent. */
  teamPoints?: number;
  /** Game masters only — the teams in play, from the roster. */
  teams?: string[];
  /** Game masters only — the backend's per-award clamps. */
  limits?: { points: number; worldPoints: number };
}

export type AwardSource = 'qr' | 'manual';

/** `awardId` is local, and is what makes replaying the queue safe. */
export interface QueuedAward {
  awardId: string;
  team: string;
  points: number;
  worldPoints: number;
  source: AwardSource;
  createdAt: number;
  status: 'pending' | 'sending' | 'applied' | 'rejected';
  /** Set on a terminal rejection — these are never resent. */
  reason?: string;
  attempts: number;
}

export interface ServerAward {
  awardId: string;
  team: string;
  points: number;
  worldPoints: number;
  gmId: string;
  gmName: string;
  source: AwardSource;
  createdAt: number;
  receivedAt: number;
  status: 'applied' | 'rejected';
  reason?: string;
}

/** `terminal` is the important bit: a business rejection is never retried. */
export type AwardResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; terminal: boolean; reason?: string };
