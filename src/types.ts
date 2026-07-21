export interface UserProfile {
  id: string; // attendee ID (Cognito username)
  name: string;
  email: string;
  phone: string;
  churchName: string;
  teamCode: string;
  teamName: string;
  roomNumber: string;
  /** Attendee IDs — parsed from the JSON-array custom attributes. */
  leadersId: string[];
  roommatesId: string[];
  isLeader: boolean;
  isMaintainer: boolean;
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
  isMaintainer?: boolean;
  /** Set on the maintainer roster so each entry shows its group. */
  teamCode?: string;
  teamName?: string;
}

/** A group of attendees (one team), used for the maintainer view. */
export interface DirectoryGroup {
  teamCode: string;
  teamName: string;
  members: DirectoryPerson[];
}

/**
 * Role-based contact directory returned by GET /contacts. The caller's role is
 * derived server-side from the verified Cognito token — never from the client.
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
}

export interface GalleryImage {
  id: string;
  name: string;
  thumbnailUrl: string;
  fullUrl: string;
  webViewLink: string;
}

export interface GalleryAlbum {
  id: string;
  name: string;
  coverUrl?: string;
}

export type TabKey = 'profile' | 'schedule' | 'gallery' | 'contacts';
