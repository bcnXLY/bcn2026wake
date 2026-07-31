import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEDULE } from '../../data/eventData';
import type { ScheduleItem } from '../../types';

type Status = 'past' | 'now' | 'upcoming';

function statusOf(startISO: string, endISO: string, now: number): Status {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (now >= start && now < end) return 'now';
  if (now >= end) return 'past';
  return 'upcoming';
}

// Minutes and seconds stay two digits so the countdown doesn't reflow on tick.
function pad(value: number) {
  return String(value).padStart(2, '0');
}

export default function ScheduleTab() {
  const { t, i18n } = useTranslation();
  // Live clock — ticks every second so the countdown's seconds stay honest;
  // the "NOW" marker rides along on the same tick.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
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

  // Next activity that has not started yet — drives the countdown header.
  const next = useMemo(() => {
    let soonest: ScheduleItem | null = null;
    let soonestStart = Infinity;
    for (const item of SCHEDULE) {
      const start = new Date(item.start).getTime();
      if (start > now && start < soonestStart) {
        soonest = item;
        soonestStart = start;
      }
    }
    if (!soonest) return null;
    // Whole seconds left, expressed as hours + minutes + seconds — hours keep
    // accumulating past 24 rather than rolling over into days.
    const totalSeconds = Math.floor((soonestStart - now) / 1_000);
    return {
      item: soonest,
      start: new Date(soonestStart),
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
  }, [now]);

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
      <div className="countdown card">
        {next ? (
          <>
            <span className="countdown-label">{t('schedule.countdown.label')}</span>
            <strong className="countdown-title">{t(next.item.titleKey)}</strong>
            <div className="countdown-clock">
              <span className="countdown-unit">
                <b>{next.hours}</b>
                {t('schedule.countdown.hours')}
              </span>
              <span className="countdown-unit">
                <b>{pad(next.minutes)}</b>
                {t('schedule.countdown.minutes')}
              </span>
              <span className="countdown-unit">
                <b>{pad(next.seconds)}</b>
                {t('schedule.countdown.seconds')}
              </span>
            </div>
            <div className="hint-text">
              {dayFmt.format(next.start)} · {timeFmt.format(next.start)}
            </div>
          </>
        ) : (
          <div className="countdown-none">{t('schedule.countdown.none')}</div>
        )}
      </div>
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
