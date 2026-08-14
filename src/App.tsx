import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import { useEventTheme } from './utils/useEventTheme';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const { profile, loading } = useAuth();
  const { t } = useTranslation();
  // The whole app turns dark for the duration of the field games.
  useEventTheme();

  if (loading) {
    return <div className="center-state">{t('common.loading')}</div>;
  }
  return profile ? <Dashboard /> : <Login />;
}
