import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const { profile, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return <div className="center-state">{t('common.loading')}</div>;
  }
  return profile ? <Dashboard /> : <Login />;
}
