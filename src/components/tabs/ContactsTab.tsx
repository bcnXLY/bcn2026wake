import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EMERGENCY_CONTACTS } from '../../data/eventData';
import { useAuth } from '../../context/AuthContext';
import { fetchContactsDirectory } from '../../services/contacts';
import type { ContactsDirectory, DirectoryPerson } from '../../types';

const CALL_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.9 9.9a16 16 0 0 0 6 6l1.5-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />
  </svg>
);

function CallButton({ phone, label }: { phone: string; label: string }) {
  const { t } = useTranslation();
  return (
    <a className="contact-call" href={`tel:${phone}`} aria-label={`${t('contacts.call')} ${label}`}>
      {CALL_ICON}
      {t('contacts.call')}
    </a>
  );
}

function PersonRow({ person, subtitle }: { person: DirectoryPerson; subtitle?: string }) {
  const { t } = useTranslation();
  // Prefer the numeric role code (translatable per locale); fall back to the
  // legacy leader/maintainer flags used by the demo directory.
  const tags =
    person.role != null
      ? person.role !== 0
        ? [t(`contacts.roles.${person.role}`)]
        : []
      : [
          person.isLeader ? t('contacts.tags.leader') : null,
          person.isMaintainer ? t('contacts.tags.maintainer') : null,
        ].filter(Boolean);

  return (
    <div className="card">
      <div className="row">
        <div>
          <strong>{person.name}</strong>
          {tags.length > 0 && <span className="tl-badge">{tags.join(' · ')}</span>}
          {subtitle && <div className="hint-text">{subtitle}</div>}
          {person.phone && <div className="hint-text">{person.phone}</div>}
        </div>
        {person.phone && <CallButton phone={person.phone} label={person.name} />}
      </div>
    </div>
  );
}

function CollapsibleGroup({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="collapse-group">
      <button type="button" className="collapse-header" aria-expanded={open} onClick={onToggle}>
        <span className="section-subtitle collapse-title">
          {title}
          <span className="collapse-count">{count}</span>
        </span>
        <span className={`collapse-chevron${open ? ' open' : ''}`} aria-hidden="true">
          ›
        </span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

interface Group {
  id: string;
  title: string;
  count: number;
  render: () => React.ReactNode;
}

export default function ContactsTab() {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [directory, setDirectory] = useState<ContactsDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return () => {};
    let active = true;
    setLoading(true);
    setError(false);
    fetchContactsDirectory(profile)
      .then((d) => active && setDirectory(d))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [profile]);

  useEffect(() => load(), [load]);

  const roomOf = useCallback(
    (p: DirectoryPerson) => (p.roomNumber ? `${t('profile.room')} ${p.roomNumber}` : undefined),
    [t],
  );

  const groups = useMemo<Group[]>(() => {
    const list: Group[] = [];

    // Emergency contacts — static, everyone sees these.
    list.push({
      id: 'emergency',
      title: t('contacts.title'),
      count: EMERGENCY_CONTACTS.length,
      render: () =>
        EMERGENCY_CONTACTS.map((c) => (
          <div className="card" key={c.id}>
            <div className="row">
              <div>
                <strong>{t(c.nameKey)}</strong>
                {c.roleKey && <div className="hint-text">{t(c.roleKey)}</div>}
                <div className="hint-text">{c.phone}</div>
              </div>
              <CallButton phone={c.phone} label={t(c.nameKey)} />
            </div>
          </div>
        )),
    });

    // Roommates — everyone with a roommates_id.
    const roommates = directory?.roommates ?? [];
    if (roommates.length > 0) {
      list.push({
        id: 'roommates',
        title: t('contacts.directory.roommates'),
        count: roommates.length,
        render: () => roommates.map((p) => <PersonRow key={p.id} person={p} subtitle={roomOf(p)} />),
      });
    }

    // Role-based directory.
    if (directory) {
      if (directory.role === 'maintainer') {
        for (const g of directory.groups ?? []) {
          list.push({
            id: `team-${g.teamCode}`,
            title: `${t('profile.team')} ${g.teamCode}`,
            count: g.members.length,
            render: () =>
              g.members.map((p) => <PersonRow key={p.id} person={p} subtitle={roomOf(p)} />),
          });
        }
        const maintainers = directory.maintainers ?? [];
        if (maintainers.length > 0) {
          list.push({
            id: 'maintainers',
            title: t('contacts.directory.maintainers'),
            count: maintainers.length,
            render: () =>
              maintainers.map((p) => (
                <PersonRow key={p.id} person={p} subtitle={`${t('profile.team')} ${p.teamCode}`} />
              )),
          });
        }
      } else {
        const people = directory.people ?? [];
        list.push({
          id: 'directory',
          title:
            directory.role === 'leader'
              ? t('contacts.directory.group')
              : t('contacts.directory.leaders'),
          count: people.length,
          render: () => people.map((p) => <PersonRow key={p.id} person={p} subtitle={roomOf(p)} />),
        });
      }
    }

    return list;
  }, [directory, roomOf, t]);

  // Accordion: keep exactly one group open. Default to the first group, and if
  // the currently-open group disappears (e.g. after a reload) fall back to it.
  useEffect(() => {
    if (groups.length === 0) return;
    setOpenId((current) =>
      current && groups.some((g) => g.id === current) ? current : groups[0].id,
    );
  }, [groups]);

  return (
    <section role="tabpanel">
      <h2 className="tab-title">{t('contacts.heading')}</h2>

      {groups.map((g) => (
        <CollapsibleGroup
          key={g.id}
          title={g.title}
          count={g.count}
          open={openId === g.id}
          onToggle={() => setOpenId((current) => (current === g.id ? null : g.id))}
        >
          {g.render()}
        </CollapsibleGroup>
      ))}

      {loading ? (
        <div className="center-state">{t('common.loading')}</div>
      ) : error ? (
        <div className="center-state">
          <div>{t('contacts.loadError')}</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

