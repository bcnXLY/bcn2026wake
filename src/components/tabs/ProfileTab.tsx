import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { updatePhone } from '../../services/auth';
import './ProfileTab.css'; // modern styles

export default function ProfileTab() {
  const { t } = useTranslation();
  const { profile, enterWithProfile } = useAuth();

  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editedPhone, setEditedPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  if (!profile) return null;

  const handleEditPhone = () => {
    setEditedPhone(profile.phone);
    setIsEditingPhone(true);
  };

  const handleSavePhone = async () => {
    if (!editedPhone.trim()) {
      setIsEditingPhone(false);
      return;
    }
    setSavingPhone(true);
    try {
      await updatePhone(profile.id, editedPhone.trim());
      enterWithProfile({ ...profile, phone: editedPhone.trim() });
      setIsEditingPhone(false);
    } catch (err) {
      console.error('Failed to update phone', err);
      // Fallback: close editing mode
      setIsEditingPhone(false);
    } finally {
      setSavingPhone(false);
    }
  };

  return (
    <section className="profile-tab" role="tabpanel">
      <h2 className="tab-title" style={{ display: 'none' }}>{t('profile.title')}</h2>

      <div className="profile-header-card">
        <h3 className="profile-name">{profile.name}</h3>
        <div>
          {profile.isLeader && <span className="profile-role-badge">{t('profile.leader')}</span>}
          {profile.isManager && <span className="profile-role-badge">{t('profile.maintainer')}</span>}
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ alignItems: isEditingPhone ? 'center' : 'flex-start' }}>
          <span className="label">{t('profile.phone')}</span>
          <span className="value">
            {isEditingPhone ? (
              <div className="input-wrapper">
                <input
                  type="tel"
                  value={editedPhone}
                  onChange={(e) => setEditedPhone(e.target.value)}
                  disabled={savingPhone}
                  className="phone-input"
                  autoFocus
                />
                <button
                  onClick={handleSavePhone}
                  disabled={savingPhone}
                  className="btn-save"
                >
                  Save
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
                <button onClick={handleEditPhone} className="btn-edit">
                  Edit
                </button>
                <a href={`tel:${profile.phone}`}>{profile.phone}</a>
              </div>
            )}
          </span>
        </div>

        {profile.churchName && (
          <div className="row">
            <span className="label">{t('profile.church')}</span>
            <span className="value">{profile.churchName}</span>
          </div>
        )}
      </div>

      {(profile.teamCode || profile.roomNumber) && (
        <div className="card">
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
      )}

      {(profile.leadersName.length > 0 || profile.roommatesName.length > 0) && (
        <div className="card">
          {profile.leadersName.length > 0 && (
            <div className="row">
              <span className="label">{t('profile.leaders')}</span>
              <span className="value">{profile.leadersName.join(', ')}</span>
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
    </section>
  );
}
