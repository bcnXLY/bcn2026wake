import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n';

/** Prominent language toggle — used on both the login page and the dashboard. */
export default function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();

  return (
    <select
      className="lang-select"
      aria-label="Language"
      value={i18n.resolvedLanguage}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
    >
      {SUPPORTED_LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {compact ? l.code.toUpperCase() : l.label}
        </option>
      ))}
    </select>
  );
}
