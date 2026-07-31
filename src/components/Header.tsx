import { useTranslation } from 'react-i18next';
import LanguageSelector from './LanguageSelector';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();

  return (
    <header className="app-header">
      <div className="team-badge">
        <small>{t('header.team')}</small>
        <strong>{profile?.teamCode || '—'}</strong>
      </div>
      <div className="header-actions">
        <LanguageSelector compact />
        <button
          className="icon-btn"
          onClick={signOut}
          aria-label={t('header.signOut')}
          title={t('header.signOut')}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </div>
    </header>
  );
}
