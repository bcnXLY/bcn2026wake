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
        <strong>{profile?.teamName || '—'}</strong>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LanguageSelector compact />
        <button
          className="icon-btn"
          onClick={signOut}
          aria-label={t('header.signOut')}
          title={t('header.signOut')}
        >
          ⎋
        </button>
      </div>
    </header>
  );
}
