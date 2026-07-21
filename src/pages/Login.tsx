import { useTranslation } from 'react-i18next';
import LanguageSelector from '../components/LanguageSelector';
import { useAuth } from '../context/AuthContext';
import { config, isDemoMode } from '../config';
import { AuthError, login } from '../services/auth';
import { useState } from 'react';

export default function Login() {
  const { t } = useTranslation();
  const { enterWithProfile, enterDemo } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState('');

  const errText = (key: string | null) => (key ? t(`login.${key}`) : null);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) return;
    if (isDemoMode()) return enterDemo();
    setBusy(true);
    setError(null);
    try {
      const profile = await login(id.trim());
      enterWithProfile(profile);
    } catch (err) {
      setError(err instanceof AuthError ? err.code : 'genericError');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-lang">
        <LanguageSelector />
      </div>

      <div className="login-head">
        <div className="login-logo" aria-hidden="true">
          B
        </div>
        <h1>{t('app.name')}</h1>
        <p>{t('app.tagline')}</p>
      </div>

      <div className="login-card">
        <form onSubmit={handleContinue}>
          <div className="field">
            <label htmlFor="id">{t('login.idLabel')}</label>
            <input
              id="id"
              autoComplete="username"
              inputMode="text"
              placeholder={t('login.idPlaceholder')}
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </div>
          <p className="hint-text">{t('login.firstTimeHint')}</p>
          {error && <p className="error-text">{errText(error) ?? t('login.genericError')}</p>}
          <button className="btn" disabled={busy || !id.trim()}>
            {busy ? t('common.loading') : t('login.continue')}
          </button>
          {config.enableTestLoginButton && (
            <button type="button" className="btn ghost" onClick={enterDemo}>
              Enter demo
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
