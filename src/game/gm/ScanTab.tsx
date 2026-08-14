import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { parseQrPayload } from '../player/TeamQr';
import { useQrScanner } from './useQrScanner';
import { drain, enqueue, pendingCount, subscribe } from '../awardQueue';
import type { GameState, QueuedAward } from '../../types';

type Flash = { kind: 'queued' | 'error'; text: string } | null;

export default function ScanTab({
  state,
  onOpenHistory,
}: {
  state: GameState;
  onOpenHistory: () => void;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const teams = state.teams ?? [];
  const maxPoints = state.limits?.points ?? 1000;
  const maxWorldPoints = state.limits?.worldPoints ?? 25;
  const teamRange = teams.length ? `${teams[0]}–${teams[teams.length - 1]}` : '';

  const [scanning, setScanning] = useState(false);
  const [team, setTeam] = useState('');
  const [points, setPoints] = useState('');
  const [worldPoints, setWorldPoints] = useState('');
  const [source, setSource] = useState<QueuedAward['source']>('manual');
  const [flash, setFlash] = useState<Flash>(null);
  const [pending, setPending] = useState(pendingCount());

  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => subscribe(() => setPending(pendingCount())), []);

  useEffect(() => {
    if (!profile) return;
    const send = () => void drain(profile);
    send();
    window.addEventListener('online', send);
    const id = window.setInterval(send, 15_000);
    return () => {
      window.removeEventListener('online', send);
      window.clearInterval(id);
    };
  }, [profile]);

  useEffect(() => {
    if (pending === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const say = useCallback((kind: 'queued' | 'error', text: string) => {
    setFlash({ kind, text });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3_500);
  }, []);

  const onDetect = useCallback(
    (raw: string) => {
      const scanned = parseQrPayload(raw);
      if (!scanned) {
        say('error', t('game.gm.notAGameCode'));
        return;
      }
      setTeam(scanned);
      setSource('qr');
      setScanning(false);
      if (navigator.vibrate) navigator.vibrate(40);
    },
    [say, t],
  );

  const { videoRef, error: cameraError, ready } = useQrScanner(scanning, onDetect);

  const teamNumber = Number(team);
  const teamValid = Number.isInteger(teamNumber) && teams.includes(String(teamNumber));
  const pointsValue = points.trim() === '' ? 0 : Number(points);
  const worldValue = worldPoints.trim() === '' ? 0 : Number(worldPoints);

  const pointsValid = Number.isInteger(pointsValue) && Math.abs(pointsValue) <= maxPoints;
  const worldValid =
    Number.isInteger(worldValue) && worldValue >= 0 && worldValue <= maxWorldPoints;
  const canSubmit =
    teamValid && pointsValid && worldValid && (pointsValue !== 0 || worldValue !== 0);

  const submit = () => {
    if (!canSubmit || !profile) return;

    enqueue({
      team: String(teamNumber),
      points: pointsValue,
      worldPoints: worldValue,
      source,
    });
    say('queued', t('game.gm.queued', { number: teamNumber }));

    setTeam('');
    setPoints('');
    setWorldPoints('');
    setSource('manual');
    void drain(profile);
  };

  return (
    <div className="fo-panel fo-gm">
      {scanning ? (
        <div className="fo-scanner">
          <video ref={videoRef} className="fo-scanner-video" muted playsInline />
          <div className="fo-scanner-frame" aria-hidden="true" />
          {!ready && !cameraError && (
            <p className="fo-scanner-hint">{t('game.gm.cameraStarting')}</p>
          )}
          {cameraError && (
            <p className="fo-scanner-hint fo-error">
              {t(`game.gm.camera.${cameraError}`)}
            </p>
          )}
          <button
            type="button"
            className="fo-btn fo-btn-ghost"
            onClick={() => setScanning(false)}
          >
            {t('game.gm.stopScan')}
          </button>
        </div>
      ) : (
        <button type="button" className="fo-btn fo-btn-scan" onClick={() => setScanning(true)}>
          {t('game.gm.scan')}
        </button>
      )}

      <div className="fo-field">
        <label htmlFor="fo-team">{t('game.gm.team')}</label>
        <input
          id="fo-team"
          type="number"
          inputMode="numeric"
          value={team}
          placeholder={teamRange}
          onChange={(e) => {
            setTeam(e.target.value);
            setSource('manual');
          }}
        />
        {team !== '' && !teamValid && (
          <p className="fo-error">{t('game.gm.teamRange', { range: teamRange })}</p>
        )}
      </div>

      <div className="fo-field-row">
        <div className="fo-field">
          <label htmlFor="fo-points">{t('game.gm.points')}</label>
          <input
            id="fo-points"
            type="number"
            inputMode="numeric"
            value={points}
            placeholder="0"
            onChange={(e) => setPoints(e.target.value)}
          />
        </div>
        <div className="fo-field">
          <label htmlFor="fo-world">{t('game.gm.worldPoints')}</label>
          <input
            id="fo-world"
            type="number"
            inputMode="numeric"
            min={0}
            max={maxWorldPoints}
            value={worldPoints}
            placeholder="0"
            onChange={(e) => setWorldPoints(e.target.value)}
          />
        </div>
      </div>

      {points !== '' && !pointsValid && (
        <p className="fo-error">{t('game.gm.pointsRange', { max: maxPoints })}</p>
      )}
      {worldPoints !== '' && !worldValid && (
        <p className="fo-error">{t('game.gm.worldRange', { max: maxWorldPoints })}</p>
      )}
      <p className="fo-note">{t('game.gm.negativeNote')}</p>

      <button type="button" className="fo-btn" disabled={!canSubmit} onClick={submit}>
        {t('game.gm.submit')}
      </button>

      {flash && (
        <p className={flash.kind === 'error' ? 'fo-error' : 'fo-ok'} role="status">
          {flash.text}
        </p>
      )}

      <button type="button" className="fo-btn fo-btn-ghost" onClick={onOpenHistory}>
        {t('game.gm.history')}
        {pending > 0 && <span className="fo-pending">{pending}</span>}
      </button>
    </div>
  );
}
