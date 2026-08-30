import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import HonourMark from '../HonourMark';
import { updatePhone } from '../../services/auth';
import { leadersRevealed } from '../../utils/schedule';
import { useNow } from '../../utils/useNow';
import './ProfileTab.css';

export default function ProfileTab() {
  const { t } = useTranslation();
  const { profile, enterWithProfile } = useAuth();

  const revealed = leadersRevealed(useNow(15_000));

  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editedPhone, setEditedPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [saveError, setSaveError] = useState(false);

  if (!profile) return null;

  const startEdit = () => {
    setEditedPhone(profile.phone);
    setSaveError(false);
    setIsEditingPhone(true);
  };

  const cancelEdit = () => {
    setIsEditingPhone(false);
    setSaveError(false);
  };

  const handleSavePhone = async () => {
    const phone = editedPhone.trim();
    if (!phone || phone === profile.phone) {
      cancelEdit();
      return;
    }
    setSavingPhone(true);
    setSaveError(false);
    try {
      await updatePhone(profile.id, phone);
      enterWithProfile({ ...profile, phone });
      setIsEditingPhone(false);
    } catch (err) {
      console.error('Failed to update phone', err);
      // Keep the field open with the typed value so the edit isn't lost.
      setSaveError(true);
    } finally {
      setSavingPhone(false);
    }
  };

  return (
    <section className="profile-tab" role="tabpanel">
      <h2 className="sr-only">{t('profile.title')}</h2>

      <div className="profile-header-card">
        <HonourMark profile={profile} className="profile-honour" />
        <span className="profile-eyebrow">{t('profile.name')}</span>
        <h3 className="profile-name">{profile.name}</h3>
        {(profile.isLeader || profile.isManager) && (
          <div className="profile-badges">
            {profile.isLeader && <span className="profile-role-badge">{t('profile.leader')}</span>}
            {profile.isManager && (
              <span className="profile-role-badge">{t('profile.maintainer')}</span>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row">
          <span className="label">{t('profile.phone')}</span>
          <span className="value">
            {isEditingPhone ? (
              <div className="input-wrapper">
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label={t('profile.phone')}
                  value={editedPhone}
                  onChange={(e) => setEditedPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSavePhone();
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  disabled={savingPhone}
                  className="phone-input"
                  autoFocus
                />
                <button onClick={handleSavePhone} disabled={savingPhone} className="btn-save">
                  {savingPhone ? t('common.saving') : t('common.save')}
                </button>
                <button onClick={cancelEdit} disabled={savingPhone} className="btn-cancel">
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <div className="phone-value">
                <span className="phone-number">{profile.phone}</span>
                <button onClick={startEdit} className="btn-edit">
                  {t('common.edit')}
                </button>
              </div>
            )}
          </span>
        </div>

        {saveError && (
          <p className="error-text" role="alert">
            {t('profile.saveFailed')}
          </p>
        )}

        {profile.churchName && (
          <div className="row">
            <span className="label">{t('profile.church')}</span>
            <span className="value">{profile.churchName}</span>
          </div>
        )}
      </div>

      {(profile.roomNumber || profile.roommatesName) && (
        <div className="card">
          {profile.roomNumber && (
            <div className="row">
              <span className="label">{t('profile.room')}</span>
              <span className="value">{profile.roomNumber}</span>
          </div>
          )}
          {profile.roommatesName.length > 0 && (
            <div className="row">
              <span className="label">{t('profile.roommates')}</span>
              <span className="value">{profile.roommatesName.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      
      {(profile.teamCode || profile.leadersName.length > 0) && (
        <div className="card">
          {profile.teamCode && (
            <div className="row">
              <span className="label">{t('profile.teamCode')}</span>
              <span className="value">{profile.teamCode}</span>
            </div>
          )}
          {profile.leadersName.length > 0 && (
            <div className="row">
              <span className="label">{t('profile.leaders')}</span>
              <span className="value">
                {revealed ? (
                  profile.leadersName.join(', ')
                ) : (
                  <span className="value-locked">
                    <span className="value-blurred" aria-hidden="true">
                      {profile.leadersName.join(', ')}
                    </span>
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
      <div className="card">
        {profile.magicNumber && (
          <div className="row">
            <span className="label">{t('profile.magicNumber')}</span>
            <span className="value">
              {revealed ? (
                profile.magicNumber
              ) : (
                <span className="value-locked">
                  <span className="value-blurred" aria-hidden="true">
                    {profile.magicNumber}
                  </span>
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
