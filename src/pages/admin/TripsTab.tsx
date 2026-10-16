import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import {
  addDays,
  cairoLocalInputToIso,
  formatDateTime,
  formatMoney,
  formatTime,
  formatTripDate,
  isoToCairoLocalInput,
  todayInCairo,
} from '../../lib/format';
import type { PickupPoint, Trip, TripInput, TripStatus } from '../../lib/types';
import { isValidEgyptianPhone, normalizePhone, toLatinDigits } from '../../lib/validation';
import { TripStatusBadge } from '../../components/Layout';
import { Button, Card, EmptyState, Field, Input, Modal, Select, Textarea, cx, useToast } from '../../components/ui';

const DEFAULT_DEST = 'مسجد سيدي إبراهيم الدسوقي – دسوق، كفر الشيخ';

interface Draft {
  title: string;
  trip_date: string;
  departure_time: string;
  departure_point: string;
  destination: string;
  capacity: string;
  max_seats_per_booking: string;
  seat_price: string;
  instapay_number: string;
  opens: string; // datetime-local بتوقيت القاهرة
  closes: string;
  status: TripStatus;
  notes: string;
  pointIds: string[];
}

function nextFriday(from = todayInCairo()): string {
  const dow = new Date(from + 'T12:00:00Z').getUTCDay();
  return addDays(from, ((5 - dow + 7) % 7) || 7);
}

function draftFromTrip(t: Trip, pointIds: string[]): Draft {
  return {
    title: t.title,
    trip_date: t.trip_date,
    departure_time: t.departure_time.slice(0, 5),
    departure_point: t.departure_point,
    destination: t.destination,
    capacity: String(t.capacity),
    max_seats_per_booking: String(t.max_seats_per_booking),
    seat_price: String(t.seat_price),
    instapay_number: t.instapay_number ?? '',
    opens: isoToCairoLocalInput(t.booking_opens_at),
    closes: isoToCairoLocalInput(t.booking_closes_at),
    status: t.status === 'full' ? 'open' : t.status,
    notes: t.notes ?? '',
    pointIds,
  };
}

/** مسودة رحلة جديدة (بعد أسبوع من آخر رحلة) — لا تُنشأ إلا بعد مراجعة المسؤول وضغط "إنشاء الرحلة". */
function draftForNextWeek(latest: Trip | undefined, latestPoints: string[], activePoints: PickupPoint[]): Draft {
  const date = latest ? addDays(latest.trip_date, 7) : nextFriday();
  const safeDate = date < todayInCairo() ? nextFriday() : date;
  return {
    title: latest?.title ?? 'رحلة سيدي إبراهيم الدسوقي',
    trip_date: safeDate,
    departure_time: latest?.departure_time.slice(0, 5) ?? '06:00',
    departure_point: latest?.departure_point ?? 'ميدان رمسيس – القاهرة',
    destination: latest?.destination ?? DEFAULT_DEST,
    capacity: String(latest?.capacity ?? 50),
    max_seats_per_booking: String(latest?.max_seats_per_booking ?? 10),
    seat_price: String(latest?.seat_price ?? 300),
    instapay_number: latest?.instapay_number ?? '',
    opens: isoToCairoLocalInput(new Date().toISOString()),
    closes: `${addDays(safeDate, -1)}T22:00`,
    status: 'open',
    notes: '',
    pointIds: (latestPoints.length ? latestPoints : activePoints.map((p) => p.id)).filter((id) =>
      activePoints.some((p) => p.id === id),
    ),
  };
}

export function TripsTab({ trips, onChanged }: { trips: Trip[]; onChanged: () => void }) {
  const toast = useToast();
  const [allPoints, setAllPoints] = useState<PickupPoint[]>([]);
  const [editor, setEditor] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  useEffect(() => {
    api.listPickupPoints().then(setAllPoints).catch((e) => toast(errorMessage(e), 'error'));
  }, [toast]);

  const sorted = [...trips].sort((a, b) => b.trip_date.localeCompare(a.trip_date));

  async function openNew() {
    const latest = sorted[0];
    const latestPoints = latest ? (await api.getTripPickupPoints(latest.id).catch(() => [])).map((p) => p.id) : [];
    setEditor({ id: null, draft: draftForNextWeek(latest, latestPoints, allPoints.filter((p) => p.is_active)) });
  }

  async function openEdit(t: Trip) {
    const pts = await api.getTripPickupPoints(t.id).catch(() => []);
    setEditor({ id: t.id, draft: draftFromTrip(t, pts.map((p) => p.id)) });
  }

  async function setStatus(t: Trip, status: TripStatus, msg: string) {
    setBusyId(t.id);
    try {
      await api.setTripStatus(t.id, status);
      toast(msg, 'success');
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">الرحلات</h2>
          <p className="text-muted">لكل رحلة حجوزاتها المستقلة. لا تُنشأ أي رحلة تلقائيًا.</p>
        </div>
        <Button onClick={() => void openNew()}>إنشاء رحلة جديدة</Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="لا توجد رحلات بعد">أنشئ أول رحلة لتظهر في صفحة الحجز.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {sorted.map((t) => {
            const past = t.trip_date < todayInCairo();
            return (
              <Card key={t.id} className={cx('p-4 sm:p-5', past && 'opacity-80')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-extrabold">{formatTripDate(t.trip_date)}</h3>
                      <TripStatusBadge trip={t} />
                      {past && <span className="text-sm text-muted">رحلة سابقة</span>}
                    </div>
                    <p className="mt-1 text-[15px] text-muted">
                      التحرك {formatTime(t.departure_time)} من {t.departure_point} — {formatMoney(t.seat_price)} للمقعد — الحجز من {formatDateTime(t.booking_opens_at)} حتى{' '}
                      {formatDateTime(t.booking_closes_at)}
                    </p>
                  </div>
                  <p className="text-lg font-extrabold tabular-nums">
                    {t.booked_seats}
                    <span className="text-[15px] font-bold text-muted">/{t.capacity}</span>
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" className="min-h-9 text-sm" onClick={() => void openEdit(t)}>
                    تعديل
                  </Button>
                  {(t.status === 'open' || t.status === 'full') && (
                    <Button variant="ghost" className="min-h-9 text-sm" loading={busyId === t.id} onClick={() => void setStatus(t, 'closed', 'تم إغلاق الحجز.')}>
                      إغلاق الحجز
                    </Button>
                  )}
                  {t.status === 'closed' && (
                    <Button variant="ghost" className="min-h-9 text-sm" loading={busyId === t.id} onClick={() => void setStatus(t, 'open', 'تم فتح الحجز.')}>
                      فتح الحجز
                    </Button>
                  )}
                  {t.status !== 'cancelled' ? (
                    confirmCancel === t.id ? (
                      <span className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2 py-1 text-sm font-semibold text-red-800">
                        تُحفظ الحجوزات ولا تُقبل حجوزات جديدة.
                        <Button
                          variant="danger"
                          className="min-h-8 bg-red-700 px-3 text-sm text-white hover:bg-red-800"
                          loading={busyId === t.id}
                          onClick={() => {
                            setConfirmCancel(null);
                            void setStatus(t, 'cancelled', 'تم إلغاء الرحلة.');
                          }}
                        >
                          تأكيد إلغاء الرحلة
                        </Button>
                        <Button variant="ghost" className="min-h-8 px-3 text-sm" onClick={() => setConfirmCancel(null)}>
                          تراجع
                        </Button>
                      </span>
                    ) : (
                      <Button variant="ghost" className="min-h-9 text-sm text-red-700 hover:bg-red-50" onClick={() => setConfirmCancel(t.id)}>
                        إلغاء الرحلة
                      </Button>
                    )
                  ) : (
                    <Button variant="ghost" className="min-h-9 text-sm" loading={busyId === t.id} onClick={() => void setStatus(t, 'closed', 'أُعيدت الرحلة كمغلقة.')}>
                      التراجع عن الإلغاء
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editor && (
        <TripEditor
          id={editor.id}
          initial={editor.draft}
          points={allPoints}
          onClose={() => setEditor(null)}
          onSaved={() => {
            toast(editor.id ? 'تم حفظ الرحلة.' : 'تم إنشاء الرحلة.', 'success');
            setEditor(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function TripEditor({
  id,
  initial,
  points,
  onClose,
  onSaved,
}: {
  id: string | null;
  initial: Draft;
  points: PickupPoint[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const visiblePoints = points.filter((p) => p.is_active || d.pointIds.includes(p.id));

  async function save(e: FormEvent) {
    e.preventDefault();
    const capacity = parseInt(d.capacity, 10);
    const maxPer = parseInt(d.max_seats_per_booking, 10);
    const price = Number(toLatinDigits(d.seat_price));
    if (!(price >= 0)) return setErr('اكتب سعر المقعد بالجنيه.');
    if (d.instapay_number.trim() && !isValidEgyptianPhone(d.instapay_number)) return setErr('رقم إنستاباي غير صحيح. اكتب رقمًا مصريًا من 11 رقمًا.');
    if (!d.trip_date || !d.departure_time || d.departure_point.trim().length < 2) return setErr('أكمل تاريخ الرحلة وموعد التحرك ونقطة الانطلاق.');
    if (!(capacity >= 1 && capacity <= 50)) return setErr('سعة الرحلة يجب أن تكون بين 1 و 50 مقعدًا.');
    if (!(maxPer >= 1 && maxPer <= 50)) return setErr('الحد الأقصى للحجز الواحد بين 1 و 50.');
    if (!d.opens || !d.closes || d.closes <= d.opens) return setErr('موعد إغلاق الحجز يجب أن يكون بعد موعد فتحه.');
    if (!d.pointIds.length) return setErr('اختر نقطة تجمع واحدة على الأقل.');
    const data: TripInput = {
      title: d.title.trim() || 'رحلة سيدي إبراهيم الدسوقي',
      trip_date: d.trip_date,
      departure_time: d.departure_time,
      departure_point: d.departure_point.trim(),
      destination: d.destination.trim() || DEFAULT_DEST,
      capacity,
      max_seats_per_booking: maxPer,
      seat_price: price,
      instapay_number: normalizePhone(d.instapay_number),
      booking_opens_at: cairoLocalInputToIso(d.opens),
      booking_closes_at: cairoLocalInputToIso(d.closes),
      status: d.status,
      notes: d.notes.trim() || null,
    };
    setBusy(true);
    setErr(null);
    try {
      await api.saveTrip(id, data, d.pointIds);
      onSaved();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={id ? 'تعديل الرحلة' : 'رحلة جديدة'} wide>
      <form onSubmit={save} className="flex flex-col gap-4">
        {!id && (
          <p className="rounded-lg bg-pine-50 p-3 text-sm text-pine-800">
            البيانات مقترحة من آخر رحلة. راجعها ثم اضغط «إنشاء الرحلة» — لن تُنشأ الرحلة قبل ذلك.
          </p>
        )}
        <Field label="عنوان الرحلة" htmlFor="te-title">
          <Input id="te-title" value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="تاريخ الرحلة" htmlFor="te-date">
            <Input id="te-date" type="date" value={d.trip_date} onChange={(e) => set('trip_date', e.target.value)} required />
          </Field>
          <Field label="موعد التحرك" htmlFor="te-time">
            <Input id="te-time" type="time" value={d.departure_time} onChange={(e) => set('departure_time', e.target.value)} required />
          </Field>
          <Field label="نقطة الانطلاق الرئيسية" htmlFor="te-from">
            <Input id="te-from" value={d.departure_point} onChange={(e) => set('departure_point', e.target.value)} required />
          </Field>
          <Field label="الوجهة" htmlFor="te-to">
            <Input id="te-to" value={d.destination} onChange={(e) => set('destination', e.target.value)} />
          </Field>
          <Field label="الحد الأقصى للمقاعد" htmlFor="te-cap" hint="لا يتجاوز 50 راكبًا">
            <Input id="te-cap" type="number" min={1} max={50} value={d.capacity} onChange={(e) => set('capacity', e.target.value)} />
          </Field>
          <Field label="أقصى عدد مقاعد للحجز الواحد" htmlFor="te-max" hint="يحد من حجز الأتوبيس كاملًا بحجز واحد">
            <Input id="te-max" type="number" min={1} max={50} value={d.max_seats_per_booking} onChange={(e) => set('max_seats_per_booking', e.target.value)} />
          </Field>
          <Field label="سعر التذكرة للمقعد (جنيه)" htmlFor="te-price">
            <Input id="te-price" inputMode="decimal" value={d.seat_price} onChange={(e) => set('seat_price', e.target.value)} />
          </Field>
          <Field label="رقم إنستاباي للدفع" optional htmlFor="te-instapay" hint="يظهر للركاب بعد الحجز">
            <Input id="te-instapay" type="tel" dir="ltr" className="text-right" value={d.instapay_number} onChange={(e) => set('instapay_number', e.target.value)} placeholder="01xxxxxxxxx" />
          </Field>
          <Field label="فتح الحجز (بتوقيت القاهرة)" htmlFor="te-open">
            <Input id="te-open" type="datetime-local" value={d.opens} onChange={(e) => set('opens', e.target.value)} required />
          </Field>
          <Field label="إغلاق الحجز (بتوقيت القاهرة)" htmlFor="te-close">
            <Input id="te-close" type="datetime-local" value={d.closes} onChange={(e) => set('closes', e.target.value)} required />
          </Field>
          <Field label="حالة الرحلة" htmlFor="te-status" hint="«مكتملة» تُضبط تلقائيًا عند امتلاء المقاعد">
            <Select id="te-status" value={d.status} onChange={(e) => set('status', e.target.value as TripStatus)}>
              <option value="open">مفتوحة للحجز</option>
              <option value="closed">مغلقة</option>
              <option value="cancelled">ملغاة</option>
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[15px] font-bold">نقاط التجمع المعتمدة</legend>
          <div className="flex flex-wrap gap-2">
            {visiblePoints.map((p) => {
              const on = d.pointIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={cx(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[15px] font-semibold',
                    on ? 'border-pine-600 bg-pine-50 text-pine-900' : 'border-line',
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-pine-700"
                    checked={on}
                    onChange={() => set('pointIds', on ? d.pointIds.filter((x) => x !== p.id) : [...d.pointIds, p.id])}
                  />
                  {p.name}
                  {!p.is_active && <span className="text-sm text-muted">(موقوفة)</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label="ملاحظات للركاب" optional htmlFor="te-notes">
          <Textarea id="te-notes" value={d.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} />
        </Field>
        {err && (
          <p role="alert" className="font-semibold text-red-700">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">
            {id ? 'حفظ الرحلة' : 'إنشاء الرحلة'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            تراجع
          </Button>
        </div>
      </form>
    </Modal>
  );
}
