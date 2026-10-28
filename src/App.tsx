import { useEffect } from 'react';
import { ToastProvider } from './components/ui';
import { useHashRoute } from './lib/hooks';
import { PublicPage } from './pages/PublicPage';
import { AdminApp } from './pages/admin/AdminApp';

export default function App() {
  const route = useHashRoute();
  const isAdmin = route.startsWith('/admin');
  useEffect(() => {
    document.title = isAdmin ? 'لوحة التحكم — باص الشروق والعبور' : 'باص الشروق والعبور — حجز المقاعد';
    window.scrollTo(0, 0);
  }, [isAdmin, route]);
  return <ToastProvider>{isAdmin ? <AdminApp route={route} /> : <PublicPage />}</ToastProvider>;
}
