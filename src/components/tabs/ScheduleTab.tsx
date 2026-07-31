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

  const dayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [i18n.resolvedLanguage],
  );

  // The event spans several days, so the timeline is grouped by day —
  // otherwise "08:30" on day 1 and day 2 read as the same morning.
  const days = useMemo(() => {
    const sorted = [...SCHEDULE].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    const grouped = new Map<string, typeof sorted>();
    for (const item of sorted) {
      const key = new Date(item.start).toDateString();
      const bucket = grouped.get(key);
      if (bucket) bucket.push(item);
      else grouped.set(key, [item]);
    }
    return [...grouped.entries()];
  }, []);

  return (
    <section role="tabpanel">
      <h2 className="tab-title">{t('schedule.title')}</h2>
      {days.length === 0 ? (
        <div className="center-state">{t('schedule.empty')}</div>
      ) : (
        days.map(([day, items]) => (
          <div key={day}>
            <h3 className="tl-day">{dayFmt.format(new Date(day))}</h3>
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
                        {t(item.titleKey)}
                        {status === 'now' && <span className="tl-badge">{t('schedule.now')}</span>}
                      </strong>
                      {item.locationKey && (
                        <div className="hint-text" style={{ marginTop: 4 }}>
                          {t(item.locationKey)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
