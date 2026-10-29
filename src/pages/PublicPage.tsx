import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { BookingForm } from '../components/BookingForm';
import { Announcements, RouteCard } from '../components/TripInfo';
import { ManageBooking } from '../components/ManageBooking';
import { BusMap, OccupancySummary } from '../components/BusOccupancy';
import { PublicPassengerList, SuccessModal } from '../components/PublicParts';
import { Card, ErrorBox, Spinner, cx, useToast } from '../components/ui';
import { DemoBanner, SiteHeader, TripBus, TripFacts } from '../components/Layout';
import { errorMessage } from '../lib/errors';
import { formatShortDate, seatsWord, todayInCairo } from '../lib/format';
import { pickDefaultTrip, useAsync } from '../lib/hooks';
import type { BookingResult, PickupPoint, PublicBooking, Trip, TripStats } from '../lib/types';

export function PublicPage() {
  const trips = useAsync(() => api.listTrips(), []);
  const [tripId, setTripId] = useState<string | null>(null);

  // الزائر يرى الرحلات الجديدة فقط: القادمة وغير المخفية (السابقة والمخفية متاحة للمسؤول فقط)
  const visible = useMemo(() => {
    const today = todayInCairo();
    return (trips.data ?? [])
      .filter((t) => !t.is_hidden && t.trip_date >= today)
      .sort((a, b) => a.trip_date.localeCompare(b.trip_date));
  }, [trips.data]);

  useEffect(() => {
    if (!tripId && visible.length) setTripId(pickDefaultTrip(visible)?.id ?? null);
  }, [visible, tripId]);

  const trip = visible.find((t) => t.id === tripId) ?? null;
  const reloadTrips = trips.reload;
  const onTripChanged = useCallback(() => void reloadTrips(true), [reloadTrips]);

  return (
    <div className="min-h-dvh">
      <DemoBanner />
      <SiteHeader top={trip && <TripBus trip={trip} />}>
        {visible.length > 1 && (
          <nav aria-label="اختيار الرحلة" className="mt-6 flex gap-2 overflow-x-auto pb-1">
            {visible.map((t) => (
              <button
                key={t.id}
                onClick={() => setTripId(t.id)}
                aria-pressed={t.id === tripId}
                className={cx(
                  'shrink-0 rounded-full border px-4 py-2 text-[15px] font-bold transition-colors',
                  t.id === tripId
                    ? 'border-white bg-white text-pine-900'
                    : 'border-white/30 text-white hover:bg-white/10',
                )}
              >
                {formatShortDate(t.trip_date)}
                {t.status === 'cancelled' && ' (ملغاة)'}
              </button>
            ))}
          </nav>
        )}
        {trip && <TripFacts trip={trip} />}
      </SiteHeader>

      <main className="mx-auto -mt-6 max-w-6xl px-4 pb-16 sm:-mt-8">
        {trips.loading && !trips.data ? (
          <Card className="flex items-center justify-center gap-3 p-10 text-muted">
            <Spinner /> جارٍ تحميل الرحلة…
          </Card>
        ) : trips.error ? (
          <ErrorBox message={trips.error} onRetry={() => void trips.reload()} />
        ) : !trip ? (
          <Card className="p-8 text-center">
            <p className="text-lg font-extrabold">لا توجد رحلة متاحة حاليًا</p>
            <p className="mt-1 text-muted">سيُعلَن عن موعد الرحلة القادمة قريبًا.</p>
          </Card>
        ) : (
          <TripView key={trip.id} trip={trip} onTripChanged={onTripChanged} />
        )}
      </main>

      <footer className="no-print border-t border-line py-6 text-center text-sm text-muted">
        <a href="#/admin" className="font-bold text-pine-700 hover:underline">
          دخول المسؤول
        </a>
      </footer>
    </div>
  );
}

function TripView({ trip, onTripChanged }: { trip: Trip; onTripChanged: () => void }) {
  const toast = useToast();
  const [stats, setStats] = useState<TripStats | null>(null);
  const [rows, setRows] = useState<PublicBooking[]>([]);
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<BookingResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.getStats(trip.id), api.getPublicBookings(trip.id)]);
      setStats(s);
      setRows(r);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [trip.id]);

  useEffect(() => {
    void refresh();
    api.getTripPickupPoints(trip.id).then(setPoints).catch((e) => setError(errorMessage(e)));
    // تحديث مباشر عند أي حجز من أي جهاز
    return api.subscribeTrip(trip.id, () => {
      void refresh();
      onTripChanged();
    });
  }, [trip.id, refresh, onTripChanged]);

  const onBooked = (r: BookingResult) => {
    setSuccess(r);
    toast(r.already_existed ? 'هذا الحجز مسجّل بالفعل.' : 'تم تسجيل الحجز بنجاح.', 'success');
    void refresh();
    onTripChanged();
  };

  return (
    <div className="flex flex-col gap-5">
      {error && <ErrorBox message={error} onRetry={() => void refresh()} />}
      <Announcements trip={trip} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Card className="order-2 p-5 sm:p-7 lg:order-1">
          <h2 className="text-xl font-extrabold">احجز مقعدك</h2>
          <p className="mt-1 mb-5 text-muted">
            املأ البيانات واضغط تأكيد، ثم حوّل المبلغ وأرسل صورة الإيصال على واتساب.{' '}
            <a href="#manage" onClick={(e) => { e.preventDefault(); document.getElementById('manage')?.scrollIntoView({ behavior: 'smooth' }); }} className="font-bold text-pine-700 underline underline-offset-4">
              حجزت من قبل؟ عدّل حجزك
            </a>
          </p>
          {stats ? (
            <BookingForm trip={trip} points={points} remaining={stats.remaining_seats} onBooked={onBooked} />
          ) : (
            <div className="flex justify-center p-8 text-muted">
              <Spinner />
            </div>
          )}
        </Card>

        <Card className="order-1 p-5 sm:p-7 lg:order-2">
          <h2 className="sr-only">إشغال الأتوبيس</h2>
          {stats ? (
            <div className="flex flex-col gap-6">
              <OccupancySummary stats={stats} />
              <BusMap capacity={stats.capacity} booked={stats.booked_seats} paid={stats.paid_seats} />
              {stats.by_pickup_point.length > 0 && (
                <div className="hidden sm:block">
                  <h3 className="mb-2 font-extrabold">الركاب حسب نقطة التجمع</h3>
                  <ul className="flex flex-col gap-2">
                    {stats.by_pickup_point.map((p) => (
                      <li key={p.pickup_point_id} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 text-[15px] font-semibold">{p.name}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-pine-50">
                          <span
                            className="block h-full rounded-full bg-pine-600"
                            style={{ width: `${stats.capacity ? (100 * p.seats) / stats.capacity : 0}%` }}
                          />
                        </span>
                        <span className="w-20 shrink-0 text-start text-sm font-bold tabular-nums text-muted">
                          {seatsWord(p.seats)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-center p-8 text-muted">
              <Spinner />
            </div>
          )}
        </Card>
      </div>

      <section id="manage" className="scroll-mt-4">
        <Card className="p-5 sm:p-7">
          <h2 className="text-xl font-extrabold">عدّل حجزك أو ألغِه</h2>
          <p className="mt-1 mb-4 text-muted">اكتب اسمك ورقم هاتفك كما سجلتهما وقت الحجز.</p>
          <ManageBooking trip={trip} onChanged={() => { void refresh(); onTripChanged(); }} />
        </Card>
      </section>

      <RouteCard trip={trip} />

      <Card className="p-5 sm:p-7">
        <h2 className="text-xl font-extrabold">الركاب المسجلون</h2>
        <p className="mt-1 mb-4 text-muted">ابحث باسمك للتأكد من حجزك وحالة الدفع.</p>
        <PublicPassengerList rows={rows} />
      </Card>

      <SuccessModal result={success} trip={trip} onClose={() => setSuccess(null)} />
    </div>
  );
}
