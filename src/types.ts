export interface UserProfile {
  id: string; // attendee ID (Cognito username)
  name: string;
  email: string;
  phone: string;
  teamName: string;
  /** Optional custom links shown on the profile tab. */
  links?: { label: string; url: string }[];
}

export interface ScheduleItem {
  id: string;
  title: string;
  location?: string;
  /** ISO 8601 start/end timestamps. */
  start: string;
  end: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  role?: string;
  phone: string;
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
