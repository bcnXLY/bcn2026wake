import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

export default function ProfileTab() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  if (!profile) return null;

  return (
    <section role="tabpanel">
      <h2 className="tab-title">{t('profile.title')}</h2>
      <div className="card">
        <div className="row">
          <span className="label">{t('profile.name')}</span>
          <span className="value">{profile.name}</span>
        </div>
        <div className="row">
          <span className="label">{t('profile.id')}</span>
          <span className="value">{profile.id}</span>
        </div>
        <div className="row">
          <span className="label">{t('profile.team')}</span>
          <span className="value">{profile.teamName}</span>
        </div>
        <div className="row">
          <span className="label">{t('profile.email')}</span>
          <span className="value">{profile.email}</span>
        </div>
        <div className="row">
          <span className="label">{t('profile.phone')}</span>
          <span className="value">
            <a href={`tel:${profile.phone}`}>{profile.phone}</a>
          </span>
        </div>
      </div>

      {profile.links && profile.links.length > 0 && (
        <div className="card">
          <div className="row">
            <span className="label">{t('profile.links')}</span>
          </div>
          {profile.links.map((link) => (
            <div className="row" key={link.url}>
              <span className="label">{link.label}</span>
              <span className="value">
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.url.replace(/^https?:\/\//, '')}
                </a>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
