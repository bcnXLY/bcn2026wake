import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { identifyPushUser, logoutPush } from '../services/push';
import { enableDemoMode } from '../config';
import { DEMO_PROFILE } from '../demo';
import type { UserProfile } from '../types';

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  enterWithProfile: (profile: UserProfile) => void;
  enterDemo: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const PROFILE_KEY = 'bcn2026-profile';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedProfile = localStorage.getItem(PROFILE_KEY);
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile) as UserProfile;
        if (parsed.id) {
          setProfile(parsed);
          identifyPushUser(parsed.id);
        }
      } catch {
        localStorage.removeItem(PROFILE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      loading,
      enterWithProfile: (profile) => {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        setProfile(profile);
        identifyPushUser(profile.id);
      },
      enterDemo: () => {
        enableDemoMode();
        setProfile(DEMO_PROFILE);
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
