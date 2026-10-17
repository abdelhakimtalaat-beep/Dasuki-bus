import type { Api } from './types';
import { ApiError } from '../errors';
import { cairoLocalInputToIso } from '../format';
import { EGYPT_MOBILE_RE, cleanName, normalizePhone, newRequestId } from '../validation';
import { normalizeArabic } from '../text';
import type {
  AdminSession,
  AuditEntry,
  Booking,
  PickupPoint,
  PublicBooking,
  Trip,
  TripStats,
} from '../types';

/**
 * ⚠️ وضع تجريبي للمعاينة فقط.
 * البيانات محفوظة في متصفح الزائر وحده (localStorage) وليست مشتركة بين الأجهزة.
 * يحاكي نفس قواعد قاعدة البيانات حتى يمكن تجربة الواجهة قبل ربط Supabase.
 */

interface DbBooking extends Omit<Booking, 'pickup_point_name'> {
  client_request_id: string | null;
}
interface Db {
  points: PickupPoint[];
  trips: Trip[];
  tripPoints: { trip_id: string; pickup_point_id: string }[];
  bookings: DbBooking[];
  audit: AuditEntry[];
  session: AdminSession | null;
}

const KEY = 'dasuki-bus-demo-v4';
export const DEMO_CREDENTIALS = { email: 'admin@demo.local', password: 'demo1234' };
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function code(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const c = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  return `DSQ-${c.slice(0, 4)}-${c.slice(4)}`;
}

export const DEMO_INSTAPAY = '01065553930';

function seed(): Db {
  const now = Date.now();
  const iso = (offsetHours: number) => new Date(now + offsetHours * 3600_000).toISOString();
  const points: PickupPoint[] = [
    { id: 'p1', name: 'المستقبل', description: null, is_active: true, sort_order: 1 },
    { id: 'p2', name: 'الشروق', description: null, is_active: true, sort_order: 2 },
  ];
  // رحلة واحدة: الأربعاء 28 أكتوبر 2026 — يغلق الحجز 25 أكتوبر 11:59 م بتوقيت القاهرة
  const trips: Trip[] = [
    {
      id: 't-1028',
      title: 'رحلة سيدي إبراهيم الدسوقي',
      trip_date: '2026-10-28',
      departure_time: '07:30',
      departure_point: 'الشروق',
      destination: 'مسجد سيدي إبراهيم الدسوقي – دسوق، كفر الشيخ',
      capacity: 50,
      max_seats_per_booking: 10,
      seat_price: 300,
      instapay_number: DEMO_INSTAPAY,
      booked_seats: 0,
      booking_opens_at: iso(-48),
      booking_closes_at: cairoLocalInputToIso('2026-10-25T23:59'),
      status: 'open',
      notes: null,
      announcements:
        'الحجز للرجال فقط.\nالتجمع في تمام الساعة 7:00 صباحًا، والانطلاق من نقطة تجمع الشروق الساعة 7:30 صباحًا.\nمسؤول الباص: محمد عبد الله ربيع.',
      route_stops:
        'الشروق\nالطريق الإقليمي\nسيدي أحمد البدوي\nسيدي عبد العزيز المكنى بأبي المجد\nسيدي إبراهيم الدسوقي\nدار الدسوقية المحمدية بالرحمانية',
      route_map_url: 'https://maps.app.goo.gl/Z9rYgAv3Hp94hX7t5',
      route_embed_url:
        'https://maps.google.com/maps?saddr=30.1302695,31.602518&daddr=30.1669614,31.6537869+to:30.7827791,30.9983505+to:31.1284091,30.6465936+to:31.10664,30.630273&output=embed',
      created_at: iso(-60),
      updated_at: iso(-1),
    },
  ];
  const tripPoints = trips.flatMap((t) => points.map((p) => ({ trip_id: t.id, pickup_point_id: p.id })));
  // بيانات تجريبية للمعاينة فقط (أسماء وأرقام وهمية)
  const names = [
    ['محمد عبد الرحمن', 3, 'p1', '01001234567', '', true],
    ['أحمد السيد', 2, 'p2', '01112345678', 'معي كرسي متحرك قابل للطي', true],
    ['فاطمة إبراهيم', 4, 'p1', '', '', false],
    ['محمود فتحي', 1, 'p2', '01223456789', '', true],
    ['حسن علي', 5, 'p1', '01556789012', 'عائلة', false],
    ['سعاد محمد', 2, 'p2', '', '', true],
    ['عبد الله مصطفى', 3, 'p1', '01098765432', '', false],
    ['خالد يوسف', 6, 'p1', '', 'مجموعة من المسجد', false],
    ['منى حسين', 2, 'p2', '01187654321', '', true],
    ['إبراهيم الدسوقي', 3, 'p2', '', '', false],
  ] as const;
  const bookings: DbBooking[] = names.map(([n, s, p, ph, no, paid], i) => ({
    id: `b${i}`,
    booking_code: code(),
    trip_id: 't-1028',
    full_name: n,
    seats: s,
    pickup_point_id: p,
    phone: ph || null,
    notes: no || null,
    status: i === 6 ? 'cancelled' : 'confirmed',
    is_paid: paid,
    paid_at: paid ? iso(-30 + i * 3) : null,
    created_at: iso(-40 + i * 3),
    updated_at: iso(-40 + i * 3),
    cancelled_at: i === 6 ? iso(-5) : null,
    client_request_id: null,
  }));
  const db: Db = { points, trips, tripPoints, bookings, audit: [], session: null };
  db.trips.forEach((t) => recompute(db, t.id));
  return db;
}

function recompute(db: Db, tripId: string) {
  const t = db.trips.find((x) => x.id === tripId);
  if (!t) return;
  t.booked_seats = db.bookings
    .filter((b) => b.trip_id === tripId && b.status === 'confirmed')
    .reduce((s, b) => s + b.seats, 0);
  if (t.status === 'open' || t.status === 'full') t.status = t.booked_seats >= t.capacity ? 'full' : 'open';
}

export function createDemoApi(): Api {
  let db: Db;
  try {
    const raw = localStorage.getItem(KEY);
    db = raw ? (JSON.parse(raw) as Db) : seed();
  } catch {
    db = seed();
  }
  const listeners = new Set<() => void>();
  const authListeners = new Set<(s: AdminSession | null) => void>();
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(KEY);
    bc.onmessage = () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) db = JSON.parse(raw) as Db;
      } catch {
        /* ignore */
      }
      listeners.forEach((l) => l());
    };
  } catch {
    bc = null;
  }

  const delay = () => new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* ignore */
    }
    bc?.postMessage('changed');
    listeners.forEach((l) => setTimeout(l, 0));
  }
  function audit(action: string, entity: string, id: string, oldData: unknown, newData: unknown) {
    db.audit.unshift({
      id: Date.now() + Math.random(),
      actor_email: db.session?.email ?? null,
      action,
      entity,
      entity_id: id,
      old_data: (oldData as Record<string, unknown>) ?? null,
      new_data: (newData as Record<string, unknown>) ?? null,
      created_at: new Date().toISOString(),
    });
    db.audit = db.audit.slice(0, 300);
  }
  function requireAdmin() {
    if (!db.session?.isAdmin) throw new ApiError('FORBIDDEN');
  }
  const pointName = (id: string) => db.points.find((p) => p.id === id)?.name ?? '';
  const trip = (id: string) => {
    const t = db.trips.find((x) => x.id === id);
    if (!t) throw new ApiError('TRIP_NOT_FOUND');
    return t;
  };

  function checkDuplicates(tripId: string, name: string, phone: string | null, exceptId: string | null) {
    const others = db.bookings.filter((b) => b.trip_id === tripId && b.status === 'confirmed' && b.id !== exceptId);
    if (others.some((b) => normalizeArabic(b.full_name) === normalizeArabic(name))) throw new ApiError('DUPLICATE_NAME');
    if (phone && others.some((b) => b.phone === phone)) throw new ApiError('DUPLICATE_PHONE');
  }

  function findMine(tripId: string, fullName: string, phone: string): DbBooking {
    const ph = normalizePhone(phone);
    if (!ph || !EGYPT_MOBILE_RE.test(ph)) throw new ApiError('INVALID_PHONE');
    const b = db.bookings.find(
      (x) =>
        x.trip_id === tripId &&
        x.status === 'confirmed' &&
        x.phone === ph &&
        normalizeArabic(x.full_name) === normalizeArabic(fullName),
    );
    if (!b) throw new ApiError('BOOKING_NOT_FOUND');
    return b;
  }

  function lockedReason(t: Trip, b: DbBooking): string | null {
    const now = new Date();
    if (t.status === 'cancelled') return 'TRIP_CANCELLED';
    if (t.status === 'closed' || now > new Date(t.booking_closes_at)) return 'BOOKING_CLOSED';
    if (now < new Date(t.booking_opens_at)) return 'BOOKING_NOT_OPEN_YET';
    if (b.is_paid) return 'PAID_LOCKED';
    return null;
  }

  function stats(tripId: string): TripStats {
    const t = trip(tripId);
    const conf = db.bookings.filter((b) => b.trip_id === tripId && b.status === 'confirmed');
    const pts = db.tripPoints
      .filter((tp) => tp.trip_id === tripId)
      .map((tp) => db.points.find((p) => p.id === tp.pickup_point_id)!)
      .filter(Boolean)
      .sort((a, b) => a.sort_order - b.sort_order);
    const paid = conf.filter((b) => b.is_paid);
    const paidSeats = paid.reduce((s, b) => s + b.seats, 0);
    return {
      trip_id: t.id,
      capacity: t.capacity,
      paid_seats: paidSeats,
      paid_bookings: paid.length,
      seat_price: t.seat_price,
      expected_amount: t.booked_seats * t.seat_price,
      paid_amount: paidSeats * t.seat_price,
      total_bookings: conf.length,
      booked_seats: t.booked_seats,
      remaining_seats: t.capacity - t.booked_seats,
      occupancy_pct: Math.round((1000 * t.booked_seats) / t.capacity) / 10,
      pickup_points_used: new Set(conf.map((b) => b.pickup_point_id)).size,
      cancelled_bookings: db.bookings.filter((b) => b.trip_id === tripId && b.status === 'cancelled').length,
      by_pickup_point: pts.map((p) => {
        const mine = conf.filter((b) => b.pickup_point_id === p.id);
        return {
          pickup_point_id: p.id,
          name: p.name,
          bookings: mine.length,
          seats: mine.reduce((s, b) => s + b.seats, 0),
        };
      }),
    };
  }

  return {
    mode: 'demo',

    async listTrips() {
      await delay();
      return [...db.trips].sort((a, b) => b.trip_date.localeCompare(a.trip_date));
    },

    async getTripPickupPoints(tripId) {
      await delay();
      return db.tripPoints
        .filter((tp) => tp.trip_id === tripId)
        .map((tp) => db.points.find((p) => p.id === tp.pickup_point_id)!)
        .filter(Boolean)
        .sort((a, b) => a.sort_order - b.sort_order);
    },

    async getStats(tripId) {
      await delay();
      return stats(tripId);
    },

    async getPublicBookings(tripId): Promise<PublicBooking[]> {
      await delay();
      return db.bookings
        .filter((b) => b.trip_id === tripId && b.status === 'confirmed')
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((b, i) => ({
          row_no: i + 1,
          display_name: b.full_name,
          seats: b.seats,
          pickup_point_name: pointName(b.pickup_point_id),
          created_at: b.created_at,
          is_paid: b.is_paid,
        }));
    },

    async createBooking(input) {
      await delay();
      const t = trip(input.trip_id);
      const existing = db.bookings.find(
        (b) => b.trip_id === t.id && b.client_request_id === input.client_request_id,
      );
      if (existing) {
        return {
          booking_code: existing.booking_code,
          full_name: existing.full_name,
          seats: existing.seats,
          pickup_point_name: pointName(existing.pickup_point_id),
          created_at: existing.created_at,
          remaining_seats: t.capacity - t.booked_seats,
          already_existed: true,
        };
      }
      const name = cleanName(input.full_name);
      if (name.length < 3 || name.length > 100) throw new ApiError('INVALID_NAME');
      if (!Number.isInteger(input.seats) || input.seats < 1) throw new ApiError('INVALID_SEATS');
      if (!input.pickup_point_id) throw new ApiError('PICKUP_REQUIRED');
      const phone = normalizePhone(input.phone);
      if (phone && !EGYPT_MOBILE_RE.test(phone)) throw new ApiError('INVALID_PHONE');
      if (!phone && !db.session?.isAdmin) throw new ApiError('PHONE_REQUIRED');
      if (t.status === 'cancelled') throw new ApiError('TRIP_CANCELLED');
      const admin = db.session?.isAdmin;
      if (!admin) {
        const now = new Date();
        if (t.status === 'closed' || now > new Date(t.booking_closes_at)) throw new ApiError('BOOKING_CLOSED');
        if (now < new Date(t.booking_opens_at)) throw new ApiError('BOOKING_NOT_OPEN_YET');
        if (t.booked_seats >= t.capacity) throw new ApiError('BUS_FULL');
        if (input.seats > t.max_seats_per_booking)
          throw new ApiError('MAX_SEATS_PER_BOOKING', String(t.max_seats_per_booking));
        const p = db.points.find((x) => x.id === input.pickup_point_id);
        const linked = db.tripPoints.some((tp) => tp.trip_id === t.id && tp.pickup_point_id === input.pickup_point_id);
        if (!p || !p.is_active || !linked) throw new ApiError('INVALID_PICKUP_POINT');
      }
      if (t.booked_seats + input.seats > t.capacity)
        throw new ApiError('NOT_ENOUGH_SEATS', String(t.capacity - t.booked_seats));
      checkDuplicates(t.id, name, phone, null);
      const now = new Date().toISOString();
      const b: DbBooking = {
        id: newRequestId(),
        booking_code: code(),
        trip_id: t.id,
        full_name: name,
        seats: input.seats,
        pickup_point_id: input.pickup_point_id,
        phone,
        notes: input.notes?.trim() || null,
        status: 'confirmed',
        is_paid: false,
        paid_at: null,
        created_at: now,
        updated_at: now,
        cancelled_at: null,
        client_request_id: input.client_request_id,
      };
      db.bookings.push(b);
      recompute(db, t.id);
      audit('create', 'bookings', b.id, null, b);
      save();
      return {
        booking_code: b.booking_code,
        full_name: b.full_name,
        seats: b.seats,
        pickup_point_name: pointName(b.pickup_point_id),
        created_at: b.created_at,
        remaining_seats: t.capacity - t.booked_seats,
        already_existed: false,
      };
    },

    async lookupBooking(c) {
      await delay();
      const b = db.bookings.find((x) => x.booking_code === c.trim().toUpperCase());
      if (!b) return null;
      const t = trip(b.trip_id);
      return {
        booking_code: b.booking_code,
        full_name: b.full_name,
        seats: b.seats,
        pickup_point_name: pointName(b.pickup_point_id),
        status: b.status,
        created_at: b.created_at,
        trip_title: t.title,
        trip_date: t.trip_date,
        departure_time: t.departure_time,
        trip_status: t.status,
        is_paid: b.is_paid,
        amount: b.seats * t.seat_price,
        instapay_number: t.instapay_number,
      };
    },

    async findMyBooking(tripId, fullName, phone) {
      await delay();
      const b = findMine(tripId, fullName, phone);
      const t = trip(tripId);
      return {
        full_name: b.full_name,
        seats: b.seats,
        pickup_point_name: pointName(b.pickup_point_id),
        notes: b.notes,
        is_paid: b.is_paid,
        created_at: b.created_at,
        max_seats: Math.min(t.max_seats_per_booking, b.seats + (t.capacity - t.booked_seats)),
        locked_reason: lockedReason(t, b),
      };
    },

    async updateMyBooking(tripId, fullName, phone, seats) {
      await delay();
      const b = findMine(tripId, fullName, phone);
      const t = trip(tripId);
      const r = lockedReason(t, b);
      if (r) throw new ApiError(r);
      if (!Number.isInteger(seats) || seats < 1) throw new ApiError('INVALID_SEATS');
      if (seats > t.max_seats_per_booking) throw new ApiError('MAX_SEATS_PER_BOOKING', String(t.max_seats_per_booking));
      const used = t.booked_seats - b.seats;
      if (used + seats > t.capacity) throw new ApiError('NOT_ENOUGH_SEATS', String(t.capacity - used));
      const old = { ...b };
      b.seats = seats;
      b.updated_at = new Date().toISOString();
      recompute(db, t.id);
      audit('update', 'bookings', b.id, old, b);
      save();
    },

    async cancelMyBooking(tripId, fullName, phone) {
      await delay();
      const b = findMine(tripId, fullName, phone);
      const t = trip(tripId);
      const r = lockedReason(t, b);
      if (r) throw new ApiError(r);
      const old = { ...b };
      b.status = 'cancelled';
      b.cancelled_at = b.updated_at = new Date().toISOString();
      recompute(db, t.id);
      audit('cancel', 'bookings', b.id, old, b);
      save();
    },

    subscribeTrip(_tripId, onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    async getSession() {
      return db.session;
    },

    async signIn(email, password) {
      await delay();
      if (email.trim().toLowerCase() !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password)
        throw new ApiError('INVALID_LOGIN');
      db.session = { email: DEMO_CREDENTIALS.email, isAdmin: true };
      save();
      authListeners.forEach((l) => l(db.session));
      return db.session;
    },

    async signOut() {
      db.session = null;
      save();
      authListeners.forEach((l) => l(null));
    },

    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },

    async listPickupPoints() {
      await delay();
      return [...db.points].sort((a, b) => a.sort_order - b.sort_order);
    },

    async savePickupPoint(p) {
      await delay();
      requireAdmin();
      const name = p.name.trim();
      if (name.length < 2) throw new ApiError('UNKNOWN');
      if (db.points.some((x) => x.id !== p.id && x.name.trim().toLowerCase() === name.toLowerCase()))
        throw new ApiError('pickup_points_name_uq');
      if (p.id) {
        const x = db.points.find((y) => y.id === p.id)!;
        const old = { ...x };
        Object.assign(x, { name, description: p.description || null, is_active: p.is_active, sort_order: p.sort_order });
        audit('update', 'pickup_points', x.id, old, x);
      } else {
        const x = { id: newRequestId(), name, description: p.description || null, is_active: p.is_active, sort_order: p.sort_order };
        db.points.push(x);
        audit('create', 'pickup_points', x.id, null, x);
      }
      save();
    },

    async saveTrip(id, data, pointIds) {
      await delay();
      requireAdmin();
      if (!pointIds.length) throw new ApiError('PICKUP_REQUIRED');
      if (data.capacity < 1 || data.capacity > 50) throw new ApiError('capacity_check');
      if (new Date(data.booking_closes_at) <= new Date(data.booking_opens_at)) throw new ApiError('trips_window_chk');
      if (data.seat_price < 0) throw new ApiError('UNKNOWN');
      data = { ...data, instapay_number: normalizePhone(data.instapay_number) };
      if (data.instapay_number && !EGYPT_MOBILE_RE.test(data.instapay_number)) throw new ApiError('instapay_number_check');
      let t: Trip;
      if (id) {
        t = trip(id);
        if (data.capacity < t.booked_seats) throw new ApiError('trips_capacity_chk');
        const used = db.bookings.some(
          (b) => b.trip_id === id && b.status === 'confirmed' && !pointIds.includes(b.pickup_point_id),
        );
        if (used) throw new ApiError('PICKUP_POINT_IN_USE');
        const old = { ...t };
        Object.assign(t, data, { updated_at: new Date().toISOString() });
        audit('update', 'trips', t.id, old, t);
      } else {
        const now = new Date().toISOString();
        t = { ...data, id: newRequestId(), booked_seats: 0, created_at: now, updated_at: now };
        db.trips.push(t);
        audit('create', 'trips', t.id, null, t);
      }
      db.tripPoints = db.tripPoints.filter((tp) => tp.trip_id !== t.id);
      pointIds.forEach((pid) => db.tripPoints.push({ trip_id: t.id, pickup_point_id: pid }));
      recompute(db, t.id);
      save();
      return t.id;
    },

    async setTripStatus(id, status) {
      await delay();
      requireAdmin();
      const t = trip(id);
      const old = { ...t };
      t.status = status;
      recompute(db, id);
      audit('update', 'trips', id, old, t);
      save();
    },

    async listBookings(tripId) {
      await delay();
      requireAdmin();
      return db.bookings
        .filter((b) => b.trip_id === tripId)
        .map(({ client_request_id: _c, ...b }) => ({ ...b, pickup_point_name: pointName(b.pickup_point_id) }));
    },

    async updateBooking(id, patch) {
      await delay();
      requireAdmin();
      const b = db.bookings.find((x) => x.id === id);
      if (!b) throw new ApiError('FORBIDDEN');
      const t = trip(b.trip_id);
      const next = { ...b, ...patch };
      if (patch.phone !== undefined) {
        next.phone = normalizePhone(patch.phone);
        if (next.phone && !EGYPT_MOBILE_RE.test(next.phone)) throw new ApiError('INVALID_PHONE');
      }
      if (patch.full_name !== undefined) {
        next.full_name = cleanName(patch.full_name);
        if (next.full_name.length < 3) throw new ApiError('INVALID_NAME');
      }
      if (next.status === 'confirmed') {
        if (t.status === 'cancelled') throw new ApiError('TRIP_CANCELLED');
        checkDuplicates(t.id, next.full_name, next.phone, id);
        const used = db.bookings
          .filter((x) => x.trip_id === t.id && x.status === 'confirmed' && x.id !== id)
          .reduce((s, x) => s + x.seats, 0);
        if (used + next.seats > t.capacity) throw new ApiError('NOT_ENOUGH_SEATS', String(Math.max(t.capacity - used, 0)));
      }
      const action =
        patch.status && patch.status !== b.status
          ? patch.status === 'cancelled'
            ? 'cancel'
            : 'restore'
          : patch.is_paid !== undefined && patch.is_paid !== b.is_paid
            ? patch.is_paid
              ? 'paid'
              : 'unpaid'
            : 'update';
      if (patch.is_paid !== undefined && patch.is_paid !== b.is_paid) next.paid_at = patch.is_paid ? new Date().toISOString() : null;
      next.updated_at = new Date().toISOString();
      next.cancelled_at = next.status === 'cancelled' ? (b.cancelled_at ?? next.updated_at) : null;
      const old = { ...b };
      Object.assign(b, next);
      recompute(db, t.id);
      audit(action, 'bookings', id, old, b);
      save();
    },

    async listAudit(limit) {
      await delay();
      requireAdmin();
      return db.audit.slice(0, limit);
    },
  };
}

export function resetDemoData(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
