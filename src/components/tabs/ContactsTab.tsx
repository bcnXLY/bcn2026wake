import { useTranslation } from 'react-i18next';
import { EMERGENCY_CONTACTS } from '../../data/eventData';

export default function ContactsTab() {
  const { t } = useTranslation();

  return (
    <section role="tabpanel">
      <h2 className="tab-title">{t('contacts.title')}</h2>
      {EMERGENCY_CONTACTS.length === 0 ? (
        <div className="center-state">{t('contacts.empty')}</div>
      ) : (
        EMERGENCY_CONTACTS.map((c) => (
          <div className="card" key={c.id}>
            <div className="row">
              <div>
                <strong>{c.name}</strong>
                {c.role && <div className="hint-text">{c.role}</div>}
                <div className="hint-text">{c.phone}</div>
              </div>
              <a className="contact-call" href={`tel:${c.phone}`} aria-label={`${t('contacts.call')} ${c.name}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.9 9.9a16 16 0 0 0 6 6l1.5-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />
                </svg>
                {t('contacts.call')}
              </a>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
