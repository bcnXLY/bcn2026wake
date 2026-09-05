import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { identifyPushUser, logoutPush } from '../services/push';
import { fetchMissingDocumentFields } from '../services/auth';
import { applyAccentFor } from '../utils/nameColor';
import type { DocumentField, UserProfile } from '../types';

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  enterWithProfile: (profile: UserProfile) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const PROFILE_KEY = 'bcn2026-profile';

function sameFields(a: DocumentField[] | undefined, b: DocumentField[]): boolean {
  const current = a ?? [];
  return current.length === b.length && current.every((field, i) => field === b[i]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * The ID card gate has to hold for sessions that logged in before it existed,
   * so a restored session re-checks what it still owes. A failed check keeps the
   * stored status: a flaky network must not lock anyone out of the app.
   */
  const refreshDocumentStatus = async (stored: UserProfile) => {
    let missing: DocumentField[];
    try {
      missing = await fetchMissingDocumentFields(stored.id);
    } catch {
      return;
    }
    if (sameFields(stored.missingDocumentFields, missing)) return;

    const refreshed = { ...stored, missingDocumentFields: missing };
    setProfile((current) => (current?.id === stored.id ? refreshed : current));
    // Not if they signed out while this was in flight — that would restore them.
    if (localStorage.getItem(PROFILE_KEY)) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(refreshed));
    }
  };

  useEffect(() => {
    const savedProfile = localStorage.getItem(PROFILE_KEY);
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile) as UserProfile;
        if (parsed.id) {
          setProfile(parsed);
          identifyPushUser(parsed.id);
          void refreshDocumentStatus(parsed);
        }
      } catch {
        localStorage.removeItem(PROFILE_KEY);
      }
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyAccentFor(profile?.name);
  }, [profile?.name]);

  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      loading,
      enterWithProfile: (profile) => {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        setProfile(profile);
        identifyPushUser(profile.id);
      },
      signOut: () => {
        localStorage.removeItem(PROFILE_KEY);
        logoutPush();
        setProfile(null);
      },
    }),
    [profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
