import { useTranslation } from 'react-i18next';
import LanguageSelector from '../components/LanguageSelector';
import { useAuth } from '../context/AuthContext';
import { config, isDemoMode } from '../config';
import { AuthError, login } from '../services/auth';
import { useEffect, useState } from 'react';

const RESEND_COOLDOWN_SECONDS = 30;

export default function Login() {
  const { t } = useTranslation();
  const { enterWithProfile, enterDemo } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  const errText = (key: string | null) => (key ? t(`login.${key}`) : null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requires2FA && !id.trim()) return;
    if (requires2FA && !code.trim()) return;
    if (isDemoMode()) return enterDemo();
    setBusy(true);
    setError(null);
    try {
      const result = requires2FA ? await login(id.trim(), code.trim()) : await login(id.trim());
      if ('requires2FA' in result) {
        setRequires2FA(true);
        setCode('');
        setResendIn(RESEND_COOLDOWN_SECONDS);
      } else {
        enterWithProfile(result as any);
      }
    } catch (err) {
      setError(err instanceof AuthError ? err.code : 'genericError');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (busy || resendIn > 0) return;
    setBusy(true);
    setError(null);
    try {
      await login(id.trim());
      setCode('');
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof AuthError ? err.code : 'genericError');
    } finally {
      setBusy(false);
    }
  };

  const handleBack = () => {
    setRequires2FA(false);
    setCode('');
    setError(null);
    setResendIn(0);
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
          {!requires2FA ? (
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
          ) : (
            <div className="field">
              <label htmlFor="code">{t('login.otpLabel')}</label>
              <input
                id="code"
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={10}
                placeholder={t('login.otpPlaceholder')}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <p className="help-text" style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)', marginTop: '0.5rem' }}>
                {t('login.otpSentSms')}
              </p>
            </div>
          )}
          {error && <p className="error-text">{errText(error) ?? t('login.genericError')}</p>}
          <button className="btn" disabled={busy || (!requires2FA && !id.trim()) || (requires2FA && !code.trim())}>
            {busy ? t('common.loading') : t('login.continue')}
          </button>
          {requires2FA && (
            <>
              <button type="button" className="btn ghost" onClick={handleResend} disabled={busy || resendIn > 0}>
                {resendIn > 0 ? t('login.resendIn', { seconds: resendIn }) : t('login.resendCode')}
              </button>
              <button type="button" className="btn ghost" onClick={handleBack} disabled={busy}>
                {t('common.back')}
              </button>
            </>
          )}
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
