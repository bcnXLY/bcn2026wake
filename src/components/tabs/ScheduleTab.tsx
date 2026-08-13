import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { currentActivity, nextActivity, roleIdOf, scheduleFor } from '../../utils/schedule';
import { useNow } from '../../utils/useNow';

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
  const { profile } = useAuth();
  // Live clock — ticks every second so the countdown's seconds stay honest;
  // the "NOW" marker rides along on the same tick.
  const now = useNow(1_000);

  // Activities restricted to other role groups never reach this screen.
  const schedule = useMemo(() => scheduleFor(roleIdOf(profile)), [profile]);

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
  const current = useMemo(() => currentActivity(schedule, now), [schedule, now]);

  // Next activity that has not started yet — drives the countdown header.
  const next = useMemo(() => {
    if (current) return null;
    const soonest = nextActivity(schedule, now);
    if (!soonest) return null;
    const start = new Date(soonest.start);
    // Whole seconds left, expressed as hours + minutes + seconds — hours keep
    // accumulating past 24 rather than rolling over into days.
    const totalSeconds = Math.floor((start.getTime() - now) / 1_000);
    return {
      item: soonest,
      start,
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
  }, [schedule, current, now]);

  // The event spans several days, so the timeline is grouped by day —
  // otherwise "08:30" on day 1 and day 2 read as the same morning.
  const days = useMemo(() => {
    const grouped = new Map<string, typeof schedule>();
    for (const item of schedule) {
      const key = new Date(item.start).toDateString();
      const bucket = grouped.get(key);
      if (bucket) bucket.push(item);
      else grouped.set(key, [item]);
    }
    return [...grouped.entries()];
  }, [schedule]);

  return (
    <section role="tabpanel">
      <h2 className="tab-title">{t('schedule.title')}</h2>
      <div className="countdown card">
        {current ? (
          <>
            <span className="countdown-label">{t('schedule.now')}</span>
            <strong className="countdown-title">{t(current.titleKey)}</strong>
            <div className="hint-text" style={{ marginTop: 8 }}>
              {timeFmt.format(new Date(current.start))} – {timeFmt.format(new Date(current.end))}
            </div>
          </>
        ) : next ? (
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
