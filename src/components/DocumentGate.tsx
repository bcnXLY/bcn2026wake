import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSelector from './LanguageSelector';
import { useAuth } from '../context/AuthContext';
import { AuthError, submitDocumentFields } from '../services/auth';
import type { DocumentField, UserProfile } from '../types';
import './DocumentGate.css';

/** Same shapes the backend accepts — spaces, dots and dashes are typed a lot. */
const SUPPORT_NUMBER_RE = /^[A-Z0-9]{5,12}$/;

function cleanSupportNumber(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase();
}

/** The error key for one typed value, or null when it is acceptable. */
function validate(field: DocumentField, value: string): string | null {
  const typed = value.trim();
  if (!typed) return 'required';
  if (field === 'supportNumber') {
    return SUPPORT_NUMBER_RE.test(cleanSupportNumber(typed)) ? null : 'invalidSupportNumber';
  }
  return Number.isNaN(Date.parse(typed)) ? 'required' : null;
}

/**
 * Blocks the app until the attendee fills in the ID card details the roster is
 * missing for them. Only the missing ones are asked for, and nothing already on
 * file is ever shown back — the values are for the organisers, not the app.
 */
export default function DocumentGate({ profile }: { profile: UserProfile }) {
  const { t } = useTranslation();
  const { enterWithProfile, signOut } = useAuth();

  const fields = profile.missingDocumentFields ?? [];
  const [values, setValues] = useState<Partial<Record<DocumentField, string>>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DocumentField, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setValue = (field: DocumentField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSaveError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const errors: Partial<Record<DocumentField, string>> = {};
    for (const field of fields) {
      const error = validate(field, values[field] ?? '');
      if (error) errors[field] = error;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      const payload = Object.fromEntries(
        fields.map((field) => [
          field,
          field === 'supportNumber'
            ? cleanSupportNumber(values[field] ?? '')
            : (values[field] ?? '').trim(),
        ]),
      );
      const stillMissing = await submitDocumentFields(profile.id, payload);
      // Whatever the server says is still missing keeps the gate up for it.
      enterWithProfile({ ...profile, missingDocumentFields: stillMissing });
    } catch (err) {
      if (err instanceof AuthError && err.field) {
        setFieldErrors({ [err.field]: 'invalidSupportNumber' });
      } else {
        setSaveError('saveFailed');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="docgate">
      <div className="docgate-lang">
        <LanguageSelector />
      </div>

      <div className="docgate-head">
        <h1>{t('documents.title')}</h1>
        <p className="docgate-intro">{t('documents.intro')}</p>
      </div>

      <form className="docgate-card" onSubmit={handleSubmit} noValidate>
        {fields.map((field) => (
          <div className="field" key={field}>
            <label htmlFor={`doc-${field}`}>{t(`documents.fields.${field}`)}</label>
            <input
              id={`doc-${field}`}
              type={field === 'supportNumber' ? 'text' : 'date'}
              inputMode={field === 'supportNumber' ? 'text' : undefined}
              autoCapitalize={field === 'supportNumber' ? 'characters' : undefined}
              autoComplete="off"
              min={field === 'supportNumber' ? undefined : '1900-01-01'}
              max={field === 'supportNumber' ? undefined : '2100-12-31'}
              placeholder={field === 'supportNumber' ? 'E25594850' : undefined}
              value={values[field] ?? ''}
              disabled={saving}
              aria-invalid={fieldErrors[field] ? true : undefined}
              aria-describedby={field === 'supportNumber' ? 'doc-supportNumber-hint' : undefined}
              onChange={(e) => setValue(field, e.target.value)}
            />
            {fieldErrors[field] && (
              <p className="error-text" role="alert">
                {t(`documents.${fieldErrors[field]}`)}
              </p>
            )}
          </div>
        ))}

        {saveError && (
          <p className="error-text" role="alert">
            {t(`documents.${saveError}`)}
          </p>
        )}

        <button className="btn" style={{ marginTop: 18 }} disabled={saving}>
          {saving ? t('common.saving') : t('documents.submit')}
        </button>
      </form>

      <button type="button" className="link-btn docgate-signout" onClick={signOut}>
        {t('documents.signOut')}
      </button>
    </div>
  );
}
