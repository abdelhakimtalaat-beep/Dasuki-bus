import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { DEMO_CREDENTIALS } from '../../lib/api/demo';
import { errorMessage } from '../../lib/errors';
import { formatTripDate, STATUS_LABEL } from '../../lib/format';
import { navigate, pickDefaultTrip, useAdminSession, useAsync } from '../../lib/hooks';
import type { Trip } from '../../lib/types';
import { DemoBanner, SiteHeader } from '../../components/Layout';
import { Button, Card, ErrorBox, Field, Input, Select, Spinner, cx } from '../../components/ui';
import { BookingsTab } from './BookingsTab';
import { TripsTab } from './TripsTab';
import { PointsTab } from './PointsTab';
import { ReportsTab, PrintView } from './ReportsTab';
import { AuditTab } from './AuditTab';

const TABS = [
  { id: 'bookings', label: 'الحجوزات' },
  { id: 'trips', label: 'الرحلات' },
  { id: 'points', label: 'نقاط التجمع' },
  { id: 'reports', label: 'التقارير' },
  { id: 'audit', label: 'سجل العمليات' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function AdminApp({ route }: { route: string }) {
  const { session, ready, setSession } = useAdminSession();

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  if (!session) return <LoginPage onDone={setSession} />;
  if (!session.isAdmin) {
    return (
      <div className="min-h-dvh">
        <SiteHeader compact />
        <main className="mx-auto max-w-md px-4 py-10">
          <Card className="p-6 text-center">
            <p className="text-lg font-extrabold">هذا الحساب ليست له صلاحية المسؤول</p>
            <p className="mt-1 text-muted">{session.email}</p>
            <Button className="mt-5" variant="secondary" onClick={() => void api.signOut().then(() => setSession(null))}>
              تسجيل الخروج
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  const parts = route.split('/').filter(Boolean); // ['admin', tab?, id?]
  if (parts[1] === 'print' && parts[2]) return <PrintView tripId={parts[2]} />;
  const tab: TabId = (TABS.find((t) => t.id === parts[1])?.id ?? 'bookings') as TabId;
  return <AdminShell tab={tab} email={session.email} onSignOut={() => void api.signOut().then(() => setSession(null))} />;
}

function AdminShell({ tab, email, onSignOut }: { tab: TabId; email: string; onSignOut: () => void }) {
  const trips = useAsync(() => api.listTrips(), []);
  const [tripId, setTripId] = useState<string | null>(null);
  useEffect(() => {
    if (trips.data && (!tripId || !trips.data.some((t) => t.id === tripId))) {
      setTripId(pickDefaultTrip(trips.data)?.id ?? null);
    }
  }, [trips.data, tripId]);
  const trip = trips.data?.find((t) => t.id === tripId) ?? null;
  const needsTrip = tab === 'bookings' || tab === 'reports';

  return (
    <div className="min-h-dvh">
      <DemoBanner />
      <header className="pattern-stars no-print text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <a href="#/" className="text-lg font-extrabold sm:text-xl">
              لوحة تحكم رحلة الدسوقي
            </a>
            <p className="text-sm text-pine-100">{email}</p>
          </div>
          <div className="flex gap-2">
            <a href="#/" className="rounded-lg px-3 py-2 text-sm font-bold text-white hover:bg-white/10">
              صفحة الحجز العامة
            </a>
            <button onClick={onSignOut} className="rounded-lg border border-white/30 px-3 py-2 text-sm font-bold hover:bg-white/10">
              تسجيل الخروج
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4" aria-label="أقسام لوحة التحكم">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#/admin/${t.id}`}
              aria-current={t.id === tab ? 'page' : undefined}
              className={cx(
                'shrink-0 rounded-t-xl px-4 py-2.5 text-[15px] font-bold',
                t.id === tab ? 'bg-paper text-pine-900' : 'text-pine-100 hover:bg-white/10',
              )}
            >
              {t.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {needsTrip && (
          <div className="no-print mb-5 flex flex-wrap items-end gap-3">
            <label className="flex min-w-64 flex-1 flex-col gap-1.5 sm:max-w-md">
              <span className="text-sm font-bold text-muted">الرحلة</span>
              <TripSelect trips={trips.data ?? []} value={tripId} onChange={setTripId} />
            </label>
            <Button variant="ghost" onClick={() => navigate('/admin/trips')}>
              إدارة الرحلات
            </Button>
          </div>
        )}
        {trips.error && <ErrorBox message={trips.error} onRetry={() => void trips.reload()} />}
        {trips.loading && !trips.data ? (
          <div className="flex justify-center p-10 text-muted">
            <Spinner />
          </div>
        ) : tab === 'trips' ? (
          <TripsTab trips={trips.data ?? []} onChanged={() => void trips.reload(true)} />
        ) : tab === 'points' ? (
          <PointsTab />
        ) : tab === 'audit' ? (
          <AuditTab />
        ) : !trip ? (
          <Card className="p-8 text-center">
            <p className="text-lg font-extrabold">لا توجد رحلات بعد</p>
            <Button className="mt-4" onClick={() => navigate('/admin/trips')}>
              إنشاء أول رحلة
            </Button>
          </Card>
        ) : tab === 'reports' ? (
          <ReportsTab key={trip.id} trip={trip} />
        ) : (
          <BookingsTab key={trip.id} trip={trip} onTripChanged={() => void trips.reload(true)} />
        )}
      </main>
    </div>
  );
}

export function TripSelect({
  trips,
  value,
  onChange,
}: {
  trips: Trip[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const sorted = [...trips].sort((a, b) => b.trip_date.localeCompare(a.trip_date));
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {sorted.map((t) => (
        <option key={t.id} value={t.id}>
          {formatTripDate(t.trip_date)} — {STATUS_LABEL[t.status]} ({t.booked_seats}/{t.capacity})
        </option>
      ))}
    </Select>
  );
}

function LoginPage({ onDone }: { onDone: (s: Awaited<ReturnType<typeof api.signIn>>) => void }) {
  const demo = api.mode === 'demo';
  const [email, setEmail] = useState(demo ? DEMO_CREDENTIALS.email : '');
  const [password, setPassword] = useState(demo ? DEMO_CREDENTIALS.password : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onDone(await api.signIn(email.trim(), password));
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-dvh">
      <DemoBanner />
      <SiteHeader compact />
      <main className="mx-auto max-w-md px-4 py-10">
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold">دخول المسؤول</h2>
          <p className="mt-1 mb-6 text-muted">لوحة التحكم متاحة لمسؤولي الرحلة فقط.</p>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="البريد الإلكتروني" htmlFor="lg-email">
              <Input id="lg-email" type="email" dir="ltr" className="text-right" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="كلمة المرور" htmlFor="lg-pass">
              <Input id="lg-pass" type="password" dir="ltr" className="text-right" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {err && (
              <p role="alert" className="font-semibold text-red-700">
                {err}
              </p>
            )}
            <Button type="submit" loading={busy} className="mt-2 min-h-12">
              تسجيل الدخول
            </Button>
          </form>
          {demo && (
            <p className="mt-5 rounded-lg bg-brass-100 p-3 text-sm text-brass-700">
              في وضع المعاينة: {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
            </p>
          )}
        </Card>
        <p className="mt-4 text-center">
          <a href="#/" className="font-bold text-pine-700 hover:underline">
            العودة لصفحة الحجز
          </a>
        </p>
      </main>
    </div>
  );
}
