import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { resetDemoData } from '../lib/api/demo';
import { bookingWindow, formatDateTime, formatMoney, formatTime, formatTripDate } from '../lib/format';
import type { Trip } from '../lib/types';
import { Badge } from './ui';

export function DemoBanner() {
  if (api.mode !== 'demo') return null;
  return (
    <div className="no-print bg-brass-100 px-4 py-2 text-center text-[14px] font-bold text-brass-700">
      وضع المعاينة التجريبي — البيانات محفوظة في هذا المتصفح فقط وليست مشتركة بين الأجهزة.{' '}
      <button
        className="underline underline-offset-4"
        onClick={() => {
          resetDemoData();
          window.location.reload();
        }}
      >
        إعادة البيانات التجريبية
      </button>
    </div>
  );
}

export function SiteHeader({ children, compact }: { children?: ReactNode; compact?: boolean }) {
  return (
    <header className="pattern-stars text-white">
      <div className={compact ? 'mx-auto max-w-6xl px-4 py-5' : 'mx-auto max-w-6xl px-4 pt-8 pb-14 sm:pt-12 sm:pb-16'}>
        <a href="#/" className="inline-block">
          <h1 className={compact ? 'text-xl font-extrabold' : 'text-[30px] leading-tight font-extrabold sm:text-5xl'}>
            رحلة سيدي إبراهيم الدسوقي <span aria-hidden="true">🚌</span>
          </h1>
        </a>
        {children}
      </div>
    </header>
  );
}

export function TripStatusBadge({ trip }: { trip: Trip }) {
  const w = bookingWindow(trip);
  const map = {
    open: <Badge tone="green">الحجز مفتوح</Badge>,
    not_yet: <Badge tone="amber">الحجز لم يبدأ</Badge>,
    ended: <Badge tone="gray">انتهى الحجز</Badge>,
    full: <Badge tone="amber">مكتملة</Badge>,
    closed: <Badge tone="gray">مغلقة</Badge>,
    cancelled: <Badge tone="red">ملغاة</Badge>,
  } as const;
  return map[w];
}

export function TripFacts({ trip }: { trip: Trip }) {
  const w = bookingWindow(trip);
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/15 bg-pine-950/35 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <p className="text-lg font-extrabold sm:text-xl">{formatTripDate(trip.trip_date)}</p>
        <p className="mt-0.5 text-pine-100">
          التحرك {formatTime(trip.departure_time)} من {trip.departure_point}
          <span className="mx-2 opacity-60">←</span>
          {trip.destination}
        </p>
        <p className="mt-2 text-[15px] font-bold text-white">
          سعر التذكرة {formatMoney(trip.seat_price)} للمقعد الواحد
        </p>
        {trip.notes && <p className="mt-1 text-[15px] text-white">{trip.notes}</p>}
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <TripStatusBadge trip={trip} />
        {w === 'open' && <p className="text-sm text-pine-100">يغلق الحجز {formatDateTime(trip.booking_closes_at)}</p>}
        {w === 'not_yet' && <p className="text-sm text-pine-100">يفتح الحجز {formatDateTime(trip.booking_opens_at)}</p>}
      </div>
    </div>
  );
}
