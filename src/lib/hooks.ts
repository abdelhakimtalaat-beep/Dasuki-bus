import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { errorMessage } from './errors';
import { bookingWindow, todayInCairo } from './format';
import type { AdminSession, Trip } from './types';

/** موجّه بسيط يعتمد على الـ hash — لا يحتاج إعدادات على الخادم عند النشر. */
export function useHashRoute(): string {
  const get = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => setRoute(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(path: string) {
  window.location.hash = path;
}

/** تحميل بيانات مع حالة تحميل/خطأ وإعادة تحميل. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(
    async (silent = false) => {
      const my = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const d = await fn();
        if (my === seq.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (my === seq.current) setError(errorMessage(e));
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

/** اختيار الرحلة الافتراضية: أقرب رحلة مفتوحة للحجز، وإلا أقرب رحلة قادمة، وإلا آخر رحلة. */
export function pickDefaultTrip(trips: Trip[]): Trip | null {
  if (!trips.length) return null;
  const today = todayInCairo();
  const upcoming = trips.filter((t) => t.trip_date >= today).sort((a, b) => a.trip_date.localeCompare(b.trip_date));
  return (
    upcoming.find((t) => bookingWindow(t) === 'open') ??
    upcoming.find((t) => t.status !== 'cancelled') ??
    upcoming[0] ??
    [...trips].sort((a, b) => b.trip_date.localeCompare(a.trip_date))[0]
  );
}

export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    api
      .getSession()
      .then((s) => alive && setSession(s))
      .catch(() => alive && setSession(null))
      .finally(() => alive && setReady(true));
    const off = api.onAuthChange((s) => alive && setSession(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return { session, ready, setSession };
}
