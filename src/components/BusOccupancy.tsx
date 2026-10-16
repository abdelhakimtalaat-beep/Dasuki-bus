import { useEffect, useState } from 'react';
import type { TripStats } from '../lib/types';
import { cx } from './ui';

/**
 * مخطط الأتوبيس من الأعلى: المقدمة يمين الشاشة (اتجاه القراءة)،
 * 4 مقاعد في كل صف مع ممر في المنتصف.
 * الأخضر الغامق = مقاعد مدفوعة، الأخضر الفاتح = محجوزة بانتظار الدفع، الأبيض = متاحة.
 * ملاحظة: الحجز بعدد المقاعد وليس باختيار مقعد بعينه — المخطط يوضح الإشغال فقط.
 */
export function BusMap({ capacity, booked, paid }: { capacity: number; booked: number; paid: number }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 120);
    return () => clearTimeout(t);
  }, []);

  const rows = Math.ceil(capacity / 4);
  const seats = Array.from({ length: capacity }, (_, i) => i);

  return (
    <figure
      className="w-full"
      aria-label={`مخطط الأتوبيس: ${booked} من ${capacity} مقعدًا محجوزًا، منها ${paid} مدفوعة`}
    >
      <div className="relative mx-auto flex w-full max-w-[560px] items-stretch rounded-[22px] rounded-s-[34px] border-2 border-pine-200 bg-pine-50/60 p-2 ps-3">
        {/* مقدمة الأتوبيس: السائق والباب */}
        <div className="flex w-9 shrink-0 flex-col items-center justify-between border-e-2 border-dashed border-pine-200 py-1 pe-2">
          <svg viewBox="0 0 24 24" className="size-6 text-pine-700" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="2.5" />
            <path d="M12 3v6.5M4.5 15.5l5.5-2.5M19.5 15.5L14 13" />
          </svg>
          <span className="h-8 w-1.5 rounded-full bg-brass-500/70" title="باب الأتوبيس" />
        </div>
        <div
          className="grid flex-1 gap-[3px] ps-2 sm:gap-1"
          style={{
            gridTemplateRows: 'repeat(2, minmax(0,1fr)) 10px repeat(2, minmax(0,1fr))',
            gridTemplateColumns: `repeat(${rows}, minmax(0, 1fr))`,
            gridAutoFlow: 'column',
          }}
          aria-hidden="true"
        >
          {Array.from({ length: rows }, (_, r) => {
            const rowSeats = seats.slice(r * 4, r * 4 + 4);
            const cells = [rowSeats[0], rowSeats[1], -1, rowSeats[2], rowSeats[3]];
            return cells.map((s, k) =>
              s === -1 ? (
                <span key={`${r}-aisle`} />
              ) : s === undefined ? (
                <span key={`${r}-${k}-empty`} />
              ) : (
                <span
                  key={s}
                  className={cx(
                    'seat-fill aspect-square rounded-[5px] border-[1.5px]',
                    !revealed || s >= booked
                      ? 'border-pine-200 bg-white'
                      : s < paid
                        ? 'border-pine-800 bg-pine-800'
                        : 'border-leaf-500 bg-leaf-300',
                  )}
                  style={{ transitionDelay: revealed ? `${Math.min(s, 50) * 14}ms` : '0ms' }}
                />
              ),
            );
          })}
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3.5 rounded-[4px] bg-pine-800" /> مدفوع
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3.5 rounded-[4px] border-[1.5px] border-leaf-500 bg-leaf-300" /> محجوز بانتظار الدفع
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3.5 rounded-[4px] border-[1.5px] border-pine-200 bg-white" /> متاح
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-pine-700">▶</span> مقدمة الأتوبيس
        </span>
      </figcaption>
    </figure>
  );
}

export function OccupancySummary({ stats }: { stats: TripStats }) {
  const pct = (n: number) => (stats.capacity ? Math.min(100, (100 * n) / stats.capacity) : 0);
  return (
    <div>
      <p className="text-ink">
        <span className="text-4xl font-extrabold tabular-nums sm:text-5xl">{stats.booked_seats}</span>
        <span className="ms-2 text-lg font-bold text-muted">من {stats.capacity} مقعدًا محجوزًا</span>
      </p>
      <p className="mt-1 text-[15px] text-muted">
        منها <b className="text-pine-800 tabular-nums">{stats.paid_seats}</b> مدفوعة و{' '}
        <b className="text-ink tabular-nums">{stats.booked_seats - stats.paid_seats}</b> بانتظار الدفع
      </p>
      <div
        className="mt-3 h-3 w-full overflow-hidden rounded-full bg-pine-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stats.capacity}
        aria-valuenow={stats.booked_seats}
        aria-label="نسبة إشغال الأتوبيس"
      >
        <div className="flex h-full">
          <div className="h-full bg-pine-800 transition-[width] duration-700" style={{ width: `${pct(stats.paid_seats)}%` }} />
          <div
            className="h-full bg-leaf-300 transition-[width] duration-700"
            style={{ width: `${pct(stats.booked_seats - stats.paid_seats)}%` }}
          />
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="المقاعد المتبقية" value={stats.remaining_seats} strong={stats.remaining_seats <= 5} />
        <Stat label="نسبة الإشغال" value={`${stats.occupancy_pct}%`} />
        <Stat label="الحجوزات المسجلة" value={stats.total_bookings} />
        <Stat label="نقاط التجمع المستخدمة" value={stats.pickup_points_used} />
      </dl>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: number | string; strong?: boolean }) {
  return (
    <div className="border-s-[3px] border-pine-200 ps-3">
      <dt className="text-[13px] font-semibold text-muted">{label}</dt>
      <dd className={cx('text-2xl font-extrabold tabular-nums', strong ? 'text-brass-700' : 'text-ink')}>{value}</dd>
    </div>
  );
}
