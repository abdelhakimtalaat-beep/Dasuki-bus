import { useEffect } from 'react';
import { ToastProvider } from './components/ui';
import { useHashRoute } from './lib/hooks';
import { useAppName } from './lib/appSettings';
import { PublicPage } from './pages/PublicPage';
import { AdminApp } from './pages/admin/AdminApp';

export default function App() {
  const route = useHashRoute();
  const isAdmin = route.startsWith('/admin');
  const appName = useAppName();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [isAdmin, route]);
  useEffect(() => {
    document.title = isAdmin ? `لوحة التحكم — ${appName}` : `${appName} — حجز المقاعد`;
  }, [isAdmin, appName]);
  return <ToastProvider>{isAdmin ? <AdminApp route={route} /> : <PublicPage />}</ToastProvider>;
}
