import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { fetchAwardHistory } from '../../services/game';
import { clearSettled, drain, resend, subscribe } from '../awardQueue';
import type { QueuedAward, ServerAward } from '../../types';

/**
 * This device's queue (the truth for anything still owed), then every game
 * master's submissions as the backend recorded them.
 */
export default function HistoryPage({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();

  const [queue, setQueue] = useState<QueuedAward[]>([]);
  const [awards, setAwards] = useState<ServerAward[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => subscribe(setQueue), []);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    fetchAwardHistory(profile)
      .then((list) => active && setAwards(list))
      .catch(() => active && setLoadFailed(true));
    return () => {
      active = false;
    };
  }, [profile]);

  const timeFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const outstanding = queue.filter(
    (award) => award.status === 'pending' || award.status === 'sending',
  );
  const settled = queue.filter(
    (award) => award.status === 'applied' || award.status === 'rejected',
  );

  return (
    <div className="fo-panel fo-history">
      <button type="button" className="fo-back" onClick={onBack}>
        {t('game.gm.back')}
      </button>

      <h3 className="fo-history-title">{t('game.gm.history')}</h3>

      {outstanding.length > 0 && (
        <p className="fo-pending-note">
          {t('game.gm.pendingNote', { count: outstanding.length })}
          <button
            type="button"
            className="fo-inline-btn"
            onClick={() => profile && void drain(profile)}
          >
            {t('game.gm.sendNow')}
          </button>
        </p>
      )}

      {queue.length === 0 && !loadFailed && awards.length === 0 && (
        <p className="fo-empty">{t('game.gm.historyEmpty')}</p>
      )}

      <ul className="fo-history-list">
        {queue.map((award) => (
          <li key={award.awardId} className={`fo-history-row ${award.status}`}>
            <span className="fo-history-dot" aria-hidden="true" />
            <div className="fo-history-body">
              <strong>{t('game.team', { number: award.team })}</strong>
              <span className="fo-history-delta">
                {award.points !== 0 && (
                  <span className={award.points > 0 ? 'plus' : 'minus'}>
                    {award.points > 0 ? '+' : ''}
                    {award.points}
                  </span>
                )}
                {award.worldPoints > 0 && (
                  <span className="world">+{award.worldPoints}%</span>
                )}
              </span>
              <span className="fo-history-meta">
                {timeFmt.format(new Date(award.createdAt))} ·{' '}
                {t(`game.gm.status.${award.status}`)}
                {award.reason && ` · ${t(`game.gm.reason.${award.reason}`, {
                  defaultValue: award.reason,
                })}`}
              </span>
            </div>
            {/* Only transient failures are resendable — a rejection would
                fail identically, so it deliberately has no button. */}
            {award.status === 'pending' && award.attempts > 0 && (
              <button
                type="button"
                className="fo-inline-btn"
                onClick={() => {
                  resend(award.awardId);
                  if (profile) void drain(profile);
                }}
              >
                {t('game.gm.resend')}
              </button>
            )}
          </li>
        ))}
      </ul>

      {settled.length > 0 && (
        <button type="button" className="fo-btn fo-btn-ghost" onClick={clearSettled}>
          {t('game.gm.clearSettled')}
        </button>
      )}

      {awards.length > 0 && (
        <>
          <h3 className="fo-history-title">{t('game.gm.allGameMasters')}</h3>
          <ul className="fo-history-list">
            {awards.map((award) => (
              <li key={award.awardId} className={`fo-history-row ${award.status}`}>
                <span className="fo-history-dot" aria-hidden="true" />
                <div className="fo-history-body">
                  <strong>{t('game.team', { number: award.team })}</strong>
                  <span className="fo-history-delta">
                    {award.points !== 0 && (
                      <span className={award.points > 0 ? 'plus' : 'minus'}>
                        {award.points > 0 ? '+' : ''}
                        {award.points}
                      </span>
                    )}
                    {award.worldPoints > 0 && (
                      <span className="world">+{award.worldPoints}%</span>
                    )}
                  </span>
                  <span className="fo-history-meta">
                    {timeFmt.format(new Date(award.receivedAt))} · {award.gmName}
                    {award.reason &&
                      ` · ${t(`game.gm.reason.${award.reason}`, {
                        defaultValue: award.reason,
                      })}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {loadFailed && <p className="fo-note">{t('game.gm.historyOffline')}</p>}
    </div>
  );
}
