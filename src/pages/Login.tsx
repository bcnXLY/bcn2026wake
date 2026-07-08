import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../components/LanguageSelector';
import { useAuth } from '../context/AuthContext';
import { config } from '../config';
import {
  AuthError,
  getLoginChannels,
  startLogin,
  submitOtp,
  type ChannelInfo,
  type OtpChannel,
} from '../services/auth';

type Step = 'id' | 'choose' | 'otp';

export default function Login() {
  const { t } = useTranslation();
  const { setSession, enterDemo } = useAuth();

  const [step, setStep] = useState<Step>('id');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState<OtpChannel>('email');
  const [channels, setChannels] = useState<Record<OtpChannel, ChannelInfo> | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Tick down the resend cooldown once per second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const errText = (key: string | null) => (key ? t(`login.${key}`) : null);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) return;
    if (config.demoMode) {
      setChannels({
        email: { available: true, hint: 'a***@example.com' },
        sms: { available: true, hint: '•••••••01' },
      });
      setStep('choose');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { channels: ch } = await getLoginChannels(id.trim());
      setChannels(ch);
      setStep('choose');
    } catch (err) {
      setError(err instanceof AuthError ? err.code : 'genericError');
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async (ch: OtpChannel) => {
    if (cooldown > 0) return;
    setChannel(ch);
    if (config.demoMode) {
      setCooldown(60);
      setStep('otp');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await startLogin(id.trim(), ch);
      setCooldown(60);
      setStep('otp');
    } catch (err) {
      if (err instanceof AuthError && err.code === 'cooldown') {
        setCooldown(err.retryAfter ?? 60);
        setStep('otp');
        setError('cooldown');
      } else {
        setError(err instanceof AuthError ? err.code : 'genericError');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (config.demoMode) return enterDemo();
    setBusy(true);
    setError(null);
    try {
      const session = await submitOtp(code.trim());
      setSession(session);
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
        {step === 'id' && (
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
      )}

      {step === 'choose' && channels && (
        <div>
          <p className="hint-text">{t('login.chooseChannel')}</p>
          <div className="channel-list">
            {(['email', 'sms'] as OtpChannel[]).map((ch) =>
              channels[ch].available ? (
                <button
                  key={ch}
                  type="button"
                  className="channel-option"
                  disabled={busy}
                  onClick={() => sendOtp(ch)}
                >
                  <span className="channel-icon" aria-hidden="true">
                    {ch === 'email' ? '✉' : '📱'}
                  </span>
                  <span className="channel-text">
                    <strong>{ch === 'email' ? t('login.channelEmail') : t('login.channelSms')}</strong>
                    {channels[ch].hint && <small>{channels[ch].hint}</small>}
                  </span>
                  <span className="channel-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              ) : null,
            )}
          </div>
          {error && <p className="error-text">{errText(error) ?? t('login.genericError')}</p>}
          <button type="button" className="btn ghost" onClick={() => setStep('id')}>
            ←
          </button>
        </div>
      )}

      {step === 'otp' && (
        <form onSubmit={handleVerify}>
          <p className="hint-text">
            {channel === 'email' ? t('login.otpSentEmail') : t('login.otpSentSms')}
            {channels?.[channel]?.hint ? ` ${channels[channel].hint}` : ''}
          </p>
          <div className="field">
            <label htmlFor="otp">{t('login.otpLabel')}</label>
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t('login.otpPlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{errText(error) ?? t('login.genericError')}</p>}
          <button className="btn" disabled={busy || code.trim().length < 6}>
            {busy ? t('common.loading') : t('login.verifyLogin')}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => sendOtp(channel)}
            disabled={busy || cooldown > 0}
          >
            {cooldown > 0
              ? t('login.resendIn', { seconds: cooldown })
              : t('login.resendCode')}
          </button>
        </form>
      )}
      </div>
    </div>
  );
}
