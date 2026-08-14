import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Planet from './planet/Planet';
import { severityOf } from './healthColor';
import type { GameStatus } from '../types';

export default function WorldMeter({
  health,
  status,
}: {
  health: number;
  status: GameStatus;
}) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);

  const clamped = Math.min(100, Math.max(0, health));
  const dead = clamped <= 0 || status === 'ended';
  const severity = dead ? 'terminal' : severityOf(clamped);
  const [whole, fraction] = clamped.toFixed(1).split('.');

  // Toggled straight on the node: this fires several times a second and has no
  // business going through React's render cycle.
  const onGlitch = useCallback((active: boolean) => {
    stageRef.current?.classList.toggle('glitching', active);
  }, []);

  return (
    <div
      className={`fo-world fo-world-${severity}`}
      role="img"
      aria-label={t('game.meter.aria', { value: clamped.toFixed(1) })}
    >
      <div className="fo-world-stage" ref={stageRef}>
        <Planet health={clamped} dead={dead} onGlitch={onGlitch} />
        <span className="fo-bracket tl" aria-hidden="true" />
        <span className="fo-bracket tr" aria-hidden="true" />
        <span className="fo-bracket bl" aria-hidden="true" />
        <span className="fo-bracket br" aria-hidden="true" />

        {/* Over the globe, as on the reference: the number is the headline. */}
        <div className="fo-readout">
          {dead ? (
            <strong className="fo-readout-dead">{t('game.meter.collapsed')}</strong>
          ) : (
            <strong className="fo-readout-value">
              {whole}
              <span className="fo-readout-fraction">.{fraction}</span>
              <span className="fo-readout-percent">%</span>
            </strong>
          )}
          <span className="fo-readout-label">{t('game.meter.label')}</span>
        </div>
      </div>

      <p className="fo-status">
        <span className="fo-status-key">{t('game.meter.status')}</span>
        <span className="fo-status-dot" aria-hidden="true" />
        <span className="fo-status-value">
          {dead ? t('game.meter.collapsedNote') : t(`game.meter.severity.${severity}`)}
        </span>
      </p>
    </div>
  );
}
