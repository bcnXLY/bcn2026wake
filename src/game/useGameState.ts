import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGameState } from '../services/game';
import type { GameState, UserProfile } from '../types';

const POLL_INTERVAL_MS = 20_000;
const JITTER_RATIO = 0.25;
const MAX_BACKOFF_MS = 160_000;
const CACHE_KEY = 'bcn2026-game-state';

function nextDelay(failures: number): number {
  if (failures === 0) {
    const jitter = POLL_INTERVAL_MS * JITTER_RATIO;
    return POLL_INTERVAL_MS + (Math.random() * 2 - 1) * jitter;
  }
  return Math.min(POLL_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
}

function readCache(): GameState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

/** Polls the world. Pauses while the tab is hidden. */
export function useGameState(profile: UserProfile | null) {
  const [state, setState] = useState<GameState | null>(() => readCache());
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const failuresRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const next = await fetchGameState(profile);
      if (!activeRef.current) return;

      setState(next);
      setOffline(false);
      failuresRef.current = 0;
      // Keeps the meter on screen if the API goes down mid-game.
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        /* private mode / quota */
      }
    } catch {
      if (!activeRef.current) return;
      failuresRef.current += 1;
      setOffline(true);
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    activeRef.current = true;

    const schedule = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(run, nextDelay(failuresRef.current));
    };

    const run = async () => {
      if (document.visibilityState === 'visible') await load();
      if (activeRef.current) schedule();
    };

    void run();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      activeRef.current = false;
      window.clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [load]);

  return { state, loading, offline, refresh: load };
}
