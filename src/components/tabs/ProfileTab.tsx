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
        {(profile.isLeader || profile.isMaintainer) && (
          <div className="row">
            <span className="label">{t('profile.role')}</span>
            <span className="value">
              {profile.isLeader && <span className="badge">{t('profile.leader')}</span>}
              {profile.isMaintainer && <span className="badge">{t('profile.maintainer')}</span>}
            </span>
          </div>
        )}
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

      <div className="card">
        {profile.churchName && (
          <div className="row">
            <span className="label">{t('profile.church')}</span>
            <span className="value">{profile.churchName}</span>
          </div>
        )}
        {profile.teamName && (
          <div className="row">
            <span className="label">{t('profile.team')}</span>
            <span className="value">{profile.teamName}</span>
          </div>
        )}
        {profile.teamCode && (
          <div className="row">
            <span className="label">{t('profile.teamCode')}</span>
            <span className="value">{profile.teamCode}</span>
          </div>
        )}
        {profile.roomNumber && (
          <div className="row">
            <span className="label">{t('profile.room')}</span>
            <span className="value">{profile.roomNumber}</span>
          </div>
        )}
      </div>

      {(profile.leadersId.length > 0 || profile.roommatesId.length > 0) && (
        <div className="card">
          {profile.leadersId.length > 0 && (
            <div className="row">
              <span className="label">{t('profile.leaders')}</span>
              <span className="value">{profile.leadersId.join(', ')}</span>
            </div>
          )}
          {profile.roommatesId.length > 0 && (
            <div className="row">
              <span className="label">{t('profile.roommates')}</span>
              <span className="value">{profile.roommatesId.join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
