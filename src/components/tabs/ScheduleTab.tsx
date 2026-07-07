import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEDULE } from '../../data/eventData';

type Status = 'past' | 'now' | 'upcoming';

function statusOf(startISO: string, endISO: string, now: number): Status {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (now >= start && now < end) return 'now';
  if (now >= end) return 'past';
  return 'upcoming';
}

export default function ScheduleTab() {
  const { t, i18n } = useTranslation();
  // Live clock — re-renders every 30s so the "NOW" marker tracks device time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.resolvedLanguage],
  );

  const items = useMemo(
    () =>
      [...SCHEDULE].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      ),
    [],
  );

  return (
    <section role="tabpanel">
      <h2 className="tab-title">{t('schedule.title')}</h2>
      {items.length === 0 ? (
        <div className="center-state">{t('schedule.empty')}</div>
      ) : (
        <div className="timeline">
          {items.map((item) => {
            const status = statusOf(item.start, item.end, now);
            return (
              <div key={item.id} className={`tl-item ${status}`}>
                <span className="tl-dot" />
                <div className="tl-time">
                  {timeFmt.format(new Date(item.start))} – {timeFmt.format(new Date(item.end))}
                </div>
                <div className="card" style={{ marginTop: 6 }}>
                  <strong>
                    {item.title}
                    {status === 'now' && <span className="tl-badge">{t('schedule.now')}</span>}
                  </strong>
                  {item.location && (
                    <div className="hint-text" style={{ marginTop: 4 }}>
                      {item.location}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
