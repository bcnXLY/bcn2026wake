import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useGameState } from './useGameState';
import { accentFor, toCss, toRgbTriple } from './healthColor';
import WorldMeter from './WorldMeter';
import Leaderboard from './Leaderboard';
import TeamTab from './player/TeamTab';
import ScanTab from './gm/ScanTab';
import HistoryPage from './gm/HistoryPage';
import './finite-one.css';

type Pane = 'world' | 'board' | 'award';

export default function FiniteOne({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { state, loading, offline } = useGameState(profile);

  const [pane, setPane] = useState<Pane>('world');
  const [historyOpen, setHistoryOpen] = useState(false);

  const view = state?.view ?? 'spectator';
  const isGm = view === 'gm';
  const isPlayer = view === 'player';

  useEffect(() => {
    if (isGm) setPane('award');
  }, [isGm]);

  if (loading && !state) {
    return (
      <div className="fo-root fo-loading">
        <p>{t('game.loading')}</p>
      </div>
    );
  }

  const health = state?.worldHealth ?? 0;
  const dead = !state || state.status === 'ended' || health <= 0;
  const accent = accentFor(health, dead);

  return (
    <div
      className="fo-root"
      style={{
        ['--fo-accent' as string]: toCss(accent),
        ['--fo-rgb' as string]: toRgbTriple(accent),
      }}
    >
      <header className="fo-header">
        <button type="button" className="fo-exit" onClick={onExit}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span className="sr-only">{t('game.exit')}</span>
        </button>
        <h1 className="fo-title">{t('game.title')}</h1>
        {offline && <span className="fo-offline">{t('game.offline')}</span>}
      </header>

      <main className="fo-body">
        {historyOpen && isGm ? (
          <HistoryPage onBack={() => setHistoryOpen(false)} />
        ) : !state ? (
          <p className="fo-empty">{t('game.unavailable')}</p>
        ) : pane === 'board' ? (
          <div className="fo-panel">
            <h2 className="fo-panel-title">{t('game.leaderboard.title')}</h2>
            <Leaderboard entries={state.leaderboard} highlightTeam={state.team} />
          </div>
        ) : pane === 'award' && isGm ? (
          <ScanTab state={state} onOpenHistory={() => setHistoryOpen(true)} />
        ) : isPlayer ? (
          <TeamTab state={state} />
        ) : (
          <div className="fo-panel">
            <WorldMeter health={state.worldHealth} status={state.status} />
            <p className="fo-note fo-centred">{t('game.spectatorNote')}</p>
          </div>
        )}
      </main>

      {!historyOpen && (
        <nav className="fo-nav" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'world'}
            className={pane === 'world' ? 'active' : ''}
            onClick={() => setPane('world')}
          >
            {isPlayer ? t('game.nav.team') : t('game.nav.world')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'board'}
            className={pane === 'board' ? 'active' : ''}
            onClick={() => setPane('board')}
          >
            {t('game.nav.leaderboard')}
          </button>
          {isGm && (
            <button
              type="button"
              role="tab"
              aria-selected={pane === 'award'}
              className={pane === 'award' ? 'active' : ''}
              onClick={() => setPane('award')}
            >
              {t('game.nav.award')}
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
