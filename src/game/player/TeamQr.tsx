import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import qrcode from 'qrcode-generator';

/** Lets the scanner tell a game QR from every other QR in the world. */
export const QR_PREFIX = 'FO1';

export function qrPayloadFor(team: string): string {
  return `${QR_PREFIX}:${team}`;
}

export function parseQrPayload(raw: string): string | null {
  const match = /^FO1:(\d{1,3})$/.exec(raw.trim());
  return match ? String(Number(match[1])) : null;
}

/**
 * Rendered large and pure black on white, screen pinned awake: field games are
 * outdoors, and a small dense code does not scan in direct sun.
 */
export default function TeamQr({ team }: { team: string }) {
  const { t } = useTranslation();
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const { path, size } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(qrPayloadFor(team));
    qr.make();

    const count = qr.getModuleCount();
    const commands: string[] = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) commands.push(`M${col} ${row}h1v1h-1z`);
      }
    }
    return { path: commands.join(''), size: count };
  }, [team]);

  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };

    nav.wakeLock
      ?.request('screen')
      .then((lock) => {
        if (cancelled) void lock.release();
        else wakeLockRef.current = lock;
      })
      .catch(() => {
        /* Denied or unsupported — the QR still shows. */
      });

    return () => {
      cancelled = true;
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  return (
    <div className="fo-qr-sheet">
      <svg
        className="fo-qr"
        viewBox={`-2 -2 ${size + 4} ${size + 4}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={t('game.qr.aria', { number: team })}
      >
        <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="#ffffff" />
        <path d={path} fill="#000000" />
      </svg>
    </div>
  );
}
