import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import WorldMeter from '../WorldMeter';
import TeamQr from './TeamQr';
import type { GameState } from '../../types';

export default function TeamTab({ state }: { state: GameState }) {
  const { t } = useTranslation();
  const [showQr, setShowQr] = useState(false);

  const team = state.team ?? '';
  const points = state.teamPoints ?? 0;

  return (
    <div className="fo-panel">
      <div className="fo-team-line">
        <span className="fo-eyebrow">{t('game.yourTeam')}</span>
        <strong className="fo-team-number">{team}</strong>
      </div>

      <WorldMeter health={state.worldHealth} status={state.status} />

      <div className="fo-points">
        <span className="fo-eyebrow">{t('game.teamPoints')}</span>
        <strong className="fo-points-value">{points.toLocaleString()}</strong>
      </div>

      <button type="button" className="fo-btn" onClick={() => setShowQr(true)}>
        {t('game.qr.show')}
      </button>

      {showQr && (
        <div
          className="fo-qr-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('game.qr.show')}
        >
          <div className="fo-qr-card">
            <TeamQr team={team} />
            <div className="fo-qr-meta">
              <span className="fo-qr-team">{t('game.team', { number: team })}</span>
              <span className="fo-qr-points">
                {t('game.teamPoints')} · <strong>{points.toLocaleString()}</strong>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="fo-btn fo-btn-ghost"
            onClick={() => setShowQr(false)}
          >
            {t('game.qr.close')}
          </button>
        </div>
      )}
    </div>
  );
}
