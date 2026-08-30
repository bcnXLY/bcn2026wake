import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../components/LanguageSelector';
import OtpInput from '../components/OtpInput';
import { useAuth } from '../context/AuthContext';
import { config, isDemoMode } from '../config';
import { AuthError, login } from '../services/auth';

const RESEND_COOLDOWN_SECONDS = 30;
const CODE_LENGTH = 6;

type Step = 'id' | 'code';

export default function Login() {
  const { t } = useTranslation();
  const { enterWithProfile, enterDemo } = useAuth();

  const [step, setStep] = useState<Step>('id');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  // Guards the auto-submit so a re-render can't fire the same code twice.
  const submittedCode = useRef<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const requestCode = async ({ resend = false } = {}) => {
    if (busy || !id.trim()) return;
    if (isDemoMode()) return enterDemo();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await login(id.trim().toUpperCase());
      if ('requires2FA' in result) {
        setStep('code');
        setCode('');
        submittedCode.current = null;
        setResendIn(RESEND_COOLDOWN_SECONDS);
        if (resend) setNotice('codeResent');
      } else {
        enterWithProfile(result);
      }
    } catch (err) {
      setError(err instanceof AuthError ? err.code : 'genericError');
    } finally {
      setBusy(false);
    }
  };

  /** Step 2 — verify the code. Called by submit and by OTP auto-complete. */
  const verifyCode = async (value: string) => {
    if (busy || value.length !== CODE_LENGTH) return;
    if (submittedCode.current === value) return;
    submittedCode.current = value;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await login(id.trim(), value);
      if ('requires2FA' in result) {
        setError('genericError');
        return;
      }
      enterWithProfile(result);
    } catch (err) {
      setError(err instanceof AuthError ? err.code : 'genericError');
      setCode('');
      submittedCode.current = null;
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'id') void requestCode();
    else void verifyCode(code);
  };

  const handleResend = () => {
    if (busy || resendIn > 0) return;
    setCode('');
    submittedCode.current = null;
    void requestCode({ resend: true });
  };

  const backToId = () => {
    setStep('id');
    setCode('');
    setError(null);
    setNotice(null);
    setResendIn(0);
    submittedCode.current = null;
  };

  return (
    <div className="login-wrap">
      <div className="login-lang">
        <LanguageSelector />
      </div>

      <div className="login-head">
        <div className="login-logo">
          <img src="/logo.png" alt={t('app.name')} />
        </div>
      </div>

      <div className="login-card">
        <form onSubmit={handleSubmit} noValidate>
          {step === 'id' ? (
            <div className="field">
              <label htmlFor="id">{t('login.idLabel')}</label>
              <input
                id="id"
                autoComplete="username"
                inputMode="text"
                autoCapitalize="characters"
                placeholder={t('login.idPlaceholder')}
                value={id}
                disabled={busy}
                onChange={(e) => setId(e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <span className="login-step">{t('login.stepVerify')}</span>
              <p className="login-sent">
                {t('login.otpSentSms')} <strong>{id.trim()}</strong>
              </p>
              <OtpInput
                value={code}
                onChange={(next) => {
                  setCode(next);
                  if (error) setError(null);
                }}
                onComplete={verifyCode}
                length={CODE_LENGTH}
                disabled={busy}
                invalid={error === 'invalidCode'}
                autoFocus
              />
            </div>
          )}

          {error && (
            <p className="error-text" role="alert">
              {t(`login.${error}`, { defaultValue: t('login.genericError') })}
            </p>
          )}
          {notice && !error && (
            <p className="ok-text" role="status">
              {t(`login.${notice}`)}
            </p>
          )}

          {step === 'id' && (
            <button className="btn" style={{ marginTop: 18 }} disabled={busy || !id.trim()}>
              {busy ? t('common.loading') : t('login.continue')}
            </button>
          )}

          {step === 'code' && (
            <>
              <div className="resend-row">
                <span>{t('login.noCode')}</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={handleResend}
                  disabled={busy || resendIn > 0}
                >
                  {resendIn > 0 ? t('login.resendIn', { seconds: resendIn }) : t('login.resendCode')}
                </button>
              </div>
              <button type="button" className="btn ghost" onClick={backToId} disabled={busy}>
                {t('login.changeId')}
              </button>
            </>
          )}

          {config.enableTestLoginButton && step === 'id' && (
            <button type="button" className="btn ghost" onClick={enterDemo}>
              Enter demo
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
