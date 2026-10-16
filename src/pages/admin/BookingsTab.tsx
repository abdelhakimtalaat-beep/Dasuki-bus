import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatMoney, seatsWord } from '../../lib/format';
import { navigate } from '../../lib/hooks';
import { cleanName, isValidEgyptianPhone, normalizePhone } from '../../lib/validation';
import type { Booking, PickupPoint, Trip, TripStats } from '../../lib/types';
import { BookingForm } from '../../components/BookingForm';
import { TripStatusBadge } from '../../components/Layout';
import { SuccessModal } from '../../components/PublicParts';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, Select, Spinner, Textarea, cx, useToast } from '../../components/ui';
import { exportTripXlsx } from './exportTrip';
import type { BookingResult } from '../../lib/types';

type SortKey = 'time' | 'name' | 'point';
type StatusFilter = 'confirmed' | 'cancelled' | 'all';
type PayFilter = 'all' | 'paid' | 'unpaid';

export function BookingsTab({ trip, onTripChanged }: { trip: Trip; onTripChanged: () => void }) {
  const toast = useToast();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [stats, setStats] = useState<TripStats | null>(null);
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [point, setPoint] = useState('');
  const [status, setStatus] = useState<StatusFilter>('confirmed');
  const [sort, setSort] = useState<SortKey>('time');
  const [pay, setPay] = useState<PayFilter>('all');
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<BookingResult | null>(null);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([api.listBookings(trip.id), api.getStats(trip.id)]);
      setBookings(b);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [trip.id]);

  useEffect(() => {
    void refresh();
    api.getTripPickupPoints(trip.id).then(setPoints).catch(() => {});
    return api.subscribeTrip(trip.id, () => void refresh());
  }, [trip.id, refresh]);

  const changed = () => {
    void refresh();
    onTripChanged();
  };

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = normalizePhone(q) ?? '';
    const out = (bookings ?? []).filter((b) => {
      if (status !== 'all' && b.status !== status) return false;
      if (point && b.pickup_point_id !== point) return false;
      if (pay === 'paid' && !b.is_paid) return false;
      if (pay === 'unpaid' && b.is_paid) return false;
      if (!needle) return true;
      return (
        b.full_name.toLowerCase().includes(needle) ||
        b.booking_code.toLowerCase().includes(needle) ||
        (digits.length >= 3 && (b.phone ?? '').includes(digits))
      );
    });
    out.sort((a, b) =>
      sort === 'name'
        ? a.full_name.localeCompare(b.full_name, 'ar')
        : sort === 'point'
          ? a.pickup_point_name.localeCompare(b.pickup_point_name, 'ar') || a.created_at.localeCompare(b.created_at)
          : a.created_at.localeCompare(b.created_at),
    );
    return out;
  }, [bookings, q, point, status, sort, pay]);

  async function togglePaid(b: Booking) {
    setPayBusy(b.id);
    try {
      await api.updateBooking(b.id, { is_paid: !b.is_paid });
      toast(b.is_paid ? `أُلغي تأكيد دفع ${b.full_name}.` : `تم تأكيد دفع ${b.full_name} (${formatMoney(b.seats * trip.seat_price)}).`, 'success');
      changed();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setPayBusy(null);
    }
  }

  async function restore(b: Booking) {
    try {
      await api.updateBooking(b.id, { status: 'confirmed' });
      toast(`تمت استعادة حجز ${b.full_name}.`, 'success');
      changed();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  async function doExport() {
    if (!stats || !bookings) return;
    setExporting(true);
    try {
      await exportTripXlsx(trip, stats, bookings, true);
      toast('تم تنزيل ملف Excel.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  }

  if (error && !bookings) return <ErrorBox message={error} onRetry={() => void refresh()} />;
  if (!bookings || !stats) {
    return (
      <div className="flex justify-center p-10 text-muted">
        <Spinner />
      </div>
    );
  }
  const viewSeats = view.filter((b) => b.status === 'confirmed').reduce((s, b) => s + b.seats, 0);

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <p>
              <span className="text-3xl font-extrabold tabular-nums">{stats.booked_seats}</span>
              <span className="ms-1.5 font-bold text-muted">من {stats.capacity} مقعدًا</span>
            </p>
            <p className="text-muted">
              متبقٍ <b className="text-ink tabular-nums">{stats.remaining_seats}</b>
            </p>
            <p className="text-muted">
              حجوزات <b className="text-ink tabular-nums">{stats.total_bookings}</b>
            </p>
            <p className="text-muted">
              ملغاة <b className="text-ink tabular-nums">{stats.cancelled_bookings}</b>
            </p>
            <p className="text-muted">
              مدفوع <b className="text-pine-800 tabular-nums">{stats.paid_seats}</b> مقعدًا —{' '}
              <b className="text-ink tabular-nums">{formatMoney(stats.paid_amount)}</b> من{' '}
              <b className="text-ink tabular-nums">{formatMoney(stats.expected_amount)}</b>
            </p>
            <TripStatusBadge trip={trip} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAdding(true)} disabled={trip.status === 'cancelled'}>
              إضافة حجز
            </Button>
            <Button variant="secondary" onClick={() => void doExport()} loading={exporting}>
              تصدير Excel
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/admin/print/${trip.id}`)}>
              طباعة القائمة
            </Button>
          </div>
        </div>
        <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-pine-100">
          <div className="h-full bg-pine-800" style={{ width: `${(100 * stats.paid_seats) / stats.capacity}%` }} />
          <div className="h-full bg-leaf-300" style={{ width: `${(100 * (stats.booked_seats - stats.paid_seats)) / stats.capacity}%` }} />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
          <Input type="search" placeholder="ابحث بالاسم أو رقم الهاتف أو رقم الحجز" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          <Select value={point} onChange={(e) => setPoint(e.target.value)} aria-label="نقطة التجمع" className="md:w-44">
            <option value="">كل نقاط التجمع</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="الحالة" className="md:w-36">
            <option value="confirmed">المؤكدة</option>
            <option value="cancelled">الملغاة</option>
            <option value="all">الكل</option>
          </Select>
          <Select value={pay} onChange={(e) => setPay(e.target.value as PayFilter)} aria-label="الدفع" className="md:w-40">
            <option value="all">الدفع: الكل</option>
            <option value="paid">مدفوع</option>
            <option value="unpaid">بانتظار الدفع</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="الترتيب" className="md:w-44">
            <option value="time">وقت التسجيل</option>
            <option value="name">الاسم</option>
            <option value="point">نقطة التجمع</option>
          </Select>
        </div>

        {view.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={bookings.length ? 'لا نتائج مطابقة' : 'لا توجد حجوزات في هذه الرحلة'}>
              {bookings.length ? 'غيّر البحث أو التصفية.' : 'شارك رابط الحجز العام مع الركاب.'}
            </EmptyState>
          </div>
        ) : (
          <>
            {/* جدول للشاشات المتوسطة والكبيرة */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1040px] text-[14px]">
                <thead>
                  <tr className="border-b-2 border-line text-start text-muted">
                    {['م', 'رقم الحجز', 'الاسم الكامل', 'المقاعد', 'نقطة التجمع', 'الهاتف', 'ملاحظات', 'وقت التسجيل', 'الحالة', 'الدفع', ''].map((h) => (
                      <th key={h} className="px-2 py-2 text-start font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.map((b, i) => (
                    <tr key={b.id} className={cx('border-b border-line align-top', b.status === 'cancelled' && 'text-muted')}>
                      <td className="px-2 py-2.5 tabular-nums">{i + 1}</td>
                      <td className="px-2 py-2.5 font-semibold whitespace-nowrap tabular-nums" dir="ltr">
                        {b.booking_code}
                      </td>
                      <td className={cx('px-2 py-2.5 font-bold', b.status === 'cancelled' && 'line-through')}>{b.full_name}</td>
                      <td className="px-2 py-2.5 font-extrabold tabular-nums">{b.seats}</td>
                      <td className="px-2 py-2.5">{b.pickup_point_name}</td>
                      <td className="px-2 py-2.5 tabular-nums" dir="ltr">
                        {b.phone ? (
                          <a className="text-pine-700 hover:underline" href={`tel:${b.phone}`}>
                            {b.phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="max-w-48 px-2 py-2.5 break-words">{b.notes ?? '—'}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap">{formatDateTime(b.created_at)}</td>
                      <td className="px-2 py-2.5">
                        {b.status === 'confirmed' ? <Badge tone="green">مؤكد</Badge> : <Badge tone="red">ملغى</Badge>}
                      </td>
                      <td className="px-2 py-1.5">
                        <PayToggle b={b} price={trip.seat_price} busy={payBusy === b.id} onToggle={togglePaid} />
                      </td>
                      <td className="px-2 py-1.5">
                        <RowActions b={b} onEdit={setEditing} onCancel={setCancelling} onRestore={restore} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* بطاقات للهاتف */}
            <ul className="mt-4 flex flex-col divide-y divide-line md:hidden">
              {view.map((b) => (
                <li key={b.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cx('font-extrabold', b.status === 'cancelled' && 'text-muted line-through')}>{b.full_name}</p>
                      <p className="text-sm text-muted">
                        {seatsWord(b.seats)} — {b.pickup_point_name}
                      </p>
                      <p className="text-sm text-muted" dir="ltr" style={{ textAlign: 'right' }}>
                        {b.booking_code}
                        {b.phone && (
                          <>
                            {'  ·  '}
                            <a className="text-pine-700" href={`tel:${b.phone}`}>
                              {b.phone}
                            </a>
                          </>
                        )}
                      </p>
                      {b.notes && <p className="mt-1 text-sm">{b.notes}</p>}
                    </div>
                    {b.status === 'confirmed' ? <Badge tone="green">مؤكد</Badge> : <Badge tone="red">ملغى</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <PayToggle b={b} price={trip.seat_price} busy={payBusy === b.id} onToggle={togglePaid} />
                    <RowActions b={b} onEdit={setEditing} onCancel={setCancelling} onRestore={restore} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-sm font-bold text-muted">
              المعروض: {view.length} حجز — المقاعد المؤكدة: {viewSeats}
            </p>
          </>
        )}
      </Card>

      {editing && (
        <EditBookingModal
          booking={editing}
          points={points}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('تم حفظ التعديل.', 'success');
            changed();
          }}
        />
      )}
      <CancelModal
        booking={cancelling}
        onClose={() => setCancelling(null)}
        onDone={(b) => {
          setCancelling(null);
          toast(`تم إلغاء حجز ${b.full_name} وإتاحة ${seatsWord(b.seats)}.`, 'success');
          changed();
        }}
      />
      <Modal open={adding} onClose={() => setAdding(false)} title="إضافة حجز (من المسؤول)" wide>
        <p className="mb-4 text-sm text-muted">يمكنك الإضافة حتى بعد إغلاق فترة الحجز، لكن السعة القصوى تبقى محمية.</p>
        <BookingForm
          trip={trip}
          points={points}
          remaining={stats.remaining_seats}
          adminMode
          onBooked={(r) => {
            setAdding(false);
            setAdded(r);
            changed();
          }}
        />
      </Modal>
      <SuccessModal result={added} trip={trip} onClose={() => setAdded(null)} />
    </div>
  );
}

function PayToggle({
  b,
  price,
  busy,
  onToggle,
}: {
  b: Booking;
  price: number;
  busy: boolean;
  onToggle: (b: Booking) => void;
}) {
  if (b.status === 'cancelled') {
    return b.is_paid ? <Badge tone="amber">مدفوع — راجع الاسترداد</Badge> : <span className="text-muted">—</span>;
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onToggle(b)}
      aria-pressed={b.is_paid}
      title={b.is_paid ? 'اضغط لإلغاء تأكيد الدفع' : 'اضغط بعد استلام التحويل'}
      className={cx(
        'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-bold whitespace-nowrap transition-colors disabled:opacity-60',
        b.is_paid
          ? 'border-pine-800 bg-pine-800 text-white hover:bg-pine-900'
          : 'border-leaf-500 bg-leaf-300/50 text-pine-900 hover:bg-leaf-300',
      )}
    >
      {b.is_paid ? '✓ مدفوع' : `تأكيد الدفع (${formatMoney(b.seats * price)})`}
    </button>
  );
}

function RowActions({
  b,
  onEdit,
  onCancel,
  onRestore,
}: {
  b: Booking;
  onEdit: (b: Booking) => void;
  onCancel: (b: Booking) => void;
  onRestore: (b: Booking) => void;
}) {
  return (
    <div className="flex gap-1">
      {b.status === 'confirmed' ? (
        <>
          <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => onEdit(b)}>
            تعديل
          </Button>
          <Button variant="ghost" className="min-h-9 px-3 text-sm text-red-700 hover:bg-red-50" onClick={() => onCancel(b)}>
            إلغاء
          </Button>
        </>
      ) : (
        <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => onRestore(b)}>
          استعادة
        </Button>
      )}
    </div>
  );
}

function EditBookingModal({
  booking,
  points,
  onClose,
  onSaved,
}: {
  booking: Booking;
  points: PickupPoint[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(booking.full_name);
  const [seats, setSeats] = useState(String(booking.seats));
  const [pointId, setPointId] = useState(booking.pickup_point_id);
  const [phone, setPhone] = useState(booking.phone ?? '');
  const [notes, setNotes] = useState(booking.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const n = parseInt(seats, 10);
    if (cleanName(name).length < 3) return setErr('اكتب الاسم الكامل (3 أحرف على الأقل).');
    if (!Number.isInteger(n) || n < 1) return setErr('عدد المقاعد يجب أن يكون 1 على الأقل.');
    if (phone.trim() && !isValidEgyptianPhone(phone)) return setErr('رقم الهاتف غير صحيح.');
    setBusy(true);
    setErr(null);
    try {
      await api.updateBooking(booking.id, {
        full_name: cleanName(name),
        seats: n,
        pickup_point_id: pointId,
        phone: normalizePhone(phone),
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`تعديل الحجز ${booking.booking_code}`}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="الاسم الكامل" htmlFor="eb-name">
          <Input id="eb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="عدد المقاعد" htmlFor="eb-seats">
            <Input id="eb-seats" type="number" min={1} max={50} value={seats} onChange={(e) => setSeats(e.target.value)} />
          </Field>
          <Field label="نقطة التجمع" htmlFor="eb-point">
            <Select id="eb-point" value={pointId} onChange={(e) => setPointId(e.target.value)}>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {!p.is_active ? ' (موقوفة)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="رقم الهاتف" optional htmlFor="eb-phone">
          <Input id="eb-phone" type="tel" dir="ltr" className="text-right" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="ملاحظات" optional htmlFor="eb-notes">
          <Textarea id="eb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
        {err && (
          <p role="alert" className="font-semibold text-red-700">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">
            حفظ التعديل
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            تراجع
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CancelModal({
  booking,
  onClose,
  onDone,
}: {
  booking: Booking | null;
  onClose: () => void;
  onDone: (b: Booking) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setErr(null), [booking]);
  if (!booking) return null;
  async function go() {
    if (!booking) return;
    setBusy(true);
    try {
      await api.updateBooking(booking.id, { status: 'cancelled' });
      onDone(booking);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="إلغاء الحجز">
      <p>
        إلغاء حجز <b>{booking.full_name}</b> ({seatsWord(booking.seats)}، رقم {booking.booking_code})؟ ستصبح المقاعد متاحة للحجز
        فورًا، ويبقى الحجز محفوظًا في السجل ويمكن استعادته.
      </p>
      {err && <p className="mt-3 font-semibold text-red-700">{err}</p>}
      <div className="mt-5 flex gap-2">
        <Button variant="danger" loading={busy} onClick={() => void go()} className="flex-1 border-red-300 bg-red-700 text-white hover:bg-red-800">
          إلغاء الحجز
        </Button>
        <Button variant="secondary" onClick={onClose}>
          تراجع
        </Button>
      </div>
    </Modal>
  );
}
