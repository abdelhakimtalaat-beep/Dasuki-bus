import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Api } from './types';
import { ApiError, toApiError } from '../errors';
import type {
  AdminSession,
  AuditEntry,
  Booking,
  BookingLookup,
  BookingResult,
  MyBooking,
  PickupPoint,
  PublicBooking,
  Trip,
  TripStats,
} from '../types';

/**
 * التنفيذ الإنتاجي على Supabase.
 * يستخدم فقط المفتاح العام (anon key) — كل الحماية في قاعدة البيانات (RLS + دوال SECURITY DEFINER).
 */
export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });

  async function run<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
    let res: { data: T; error: unknown };
    try {
      res = await p;
    } catch (e) {
      throw toApiError(e);
    }
    if (res.error) throw toApiError(res.error);
    return res.data;
  }

  async function sessionFromUser(): Promise<AdminSession | null> {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const isAdmin = await run(sb.rpc('is_admin'));
    return { email: user.email ?? '', isAdmin: isAdmin === true };
  }

  return {
    mode: 'supabase',

    async listTrips() {
      const rows = (await run(sb.from('trips').select('*').order('trip_date', { ascending: false }))) as Trip[];
      return rows.map((t) => ({ ...t, seat_price: Number(t.seat_price) }));
    },

    async getTripPickupPoints(tripId) {
      const rows = await run(
        sb.from('trip_pickup_points').select('pickup_points(*)').eq('trip_id', tripId),
      );
      return (rows as unknown as { pickup_points: PickupPoint }[])
        .map((r) => r.pickup_points)
        .filter(Boolean)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ar'));
    },

    async getStats(tripId) {
      const s = (await run(sb.rpc('get_trip_stats', { p_trip_id: tripId }))) as TripStats | null;
      if (!s) throw new ApiError('TRIP_NOT_FOUND');
      // أعمدة numeric تصل أحيانًا كنص
      return { ...s, seat_price: Number(s.seat_price), expected_amount: Number(s.expected_amount), paid_amount: Number(s.paid_amount) };
    },

    async getPublicBookings(tripId) {
      return (await run(sb.rpc('get_public_bookings', { p_trip_id: tripId }))) as PublicBooking[];
    },

    async createBooking(input) {
      const rows = await run(
        sb.rpc('create_booking', {
          p_trip_id: input.trip_id,
          p_full_name: input.full_name,
          p_seats: input.seats,
          p_pickup_point_id: input.pickup_point_id,
          p_phone: input.phone,
          p_notes: input.notes,
          p_client_request_id: input.client_request_id,
        }),
      );
      const row = (rows as BookingResult[])[0];
      if (!row) throw new ApiError('UNKNOWN');
      return row;
    },

    async lookupBooking(code) {
      const rows = (await run(sb.rpc('lookup_booking', { p_code: code }))) as BookingLookup[];
      return rows[0] ? { ...rows[0], amount: Number(rows[0].amount) } : null;
    },

    async findMyBooking(tripId, fullName, phone) {
      const rows = (await run(
        sb.rpc('find_my_booking', { p_trip_id: tripId, p_full_name: fullName, p_phone: phone }),
      )) as MyBooking[];
      if (!rows[0]) throw new ApiError('BOOKING_NOT_FOUND');
      return rows[0];
    },

    async updateMyBooking(tripId, fullName, phone, seats) {
      await run(sb.rpc('update_my_booking', { p_trip_id: tripId, p_full_name: fullName, p_phone: phone, p_seats: seats }));
    },

    async cancelMyBooking(tripId, fullName, phone) {
      await run(sb.rpc('cancel_my_booking', { p_trip_id: tripId, p_full_name: fullName, p_phone: phone }));
    },

    subscribeTrip(tripId, onChange) {
      // الزائر يشترك في صف الرحلة (booked_seats يتغير مع كل حجز/إلغاء).
      // المسؤول يستقبل أيضًا تغييرات جدول الحجوزات (RLS يمنعها عن الزوار).
      const tag = Math.random().toString(36).slice(2);
      const tripChannel = sb
        .channel(`trip-${tripId}-${tag}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, onChange)
        .subscribe();
      // قناة منفصلة للحجوزات: تصل أحداثها للمسؤول فقط (RLS)، ولا تؤثر على قناة الزوار إن رُفضت
      const bookingsChannel = sb
        .channel(`bookings-${tripId}-${tag}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings', filter: `trip_id=eq.${tripId}` },
          onChange,
        )
        .subscribe();
      // احتياطي: تحديث دوري كل 30 ثانية إذا انقطع الاتصال المباشر
      const timer = window.setInterval(onChange, 30_000);
      return () => {
        window.clearInterval(timer);
        void sb.removeChannel(tripChannel);
        void sb.removeChannel(bookingsChannel);
      };
    },

    getSession: sessionFromUser,

    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw toApiError(error);
      const s = await sessionFromUser();
      if (!s) throw new ApiError('INVALID_LOGIN');
      return s;
    },

    async signOut() {
      await sb.auth.signOut();
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => {
        // تأجيل الاستدعاء لتجنب الاستدعاء المتداخل داخل مستمع Supabase
        setTimeout(() => void sessionFromUser().then(cb).catch(() => cb(null)), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async listPickupPoints() {
      return (await run(
        sb.from('pickup_points').select('*').order('sort_order').order('name'),
      )) as PickupPoint[];
    },

    async savePickupPoint(p) {
      const row = {
        name: p.name.trim(),
        description: p.description?.trim() || null,
        is_active: p.is_active,
        sort_order: p.sort_order,
      };
      if (p.id) await run(sb.from('pickup_points').update(row).eq('id', p.id).select('id').single());
      else await run(sb.from('pickup_points').insert(row).select('id').single());
    },

    async saveTrip(id, data, pointIds) {
      return (await run(
        sb.rpc('admin_save_trip', { p_id: id, p_data: data, p_point_ids: pointIds }),
      )) as string;
    },

    async setTripStatus(id, status) {
      await run(sb.rpc('admin_set_trip_status', { p_id: id, p_status: status }));
    },

    async setTripHidden(id, hidden) {
      await run(sb.rpc('admin_set_trip_hidden', { p_id: id, p_hidden: hidden }));
    },

    async listBookings(tripId) {
      const rows = await run(
        sb
          .from('bookings')
          .select(
            'id, booking_code, trip_id, full_name, seats, pickup_point_id, phone, notes, status, is_paid, paid_at, created_at, updated_at, cancelled_at, pickup_points(name)',
          )
          .eq('trip_id', tripId)
          .order('created_at'),
      );
      return (rows as unknown as (Omit<Booking, 'pickup_point_name'> & { pickup_points: { name: string } | null })[]).map(
        ({ pickup_points, ...b }) => ({ ...b, pickup_point_name: pickup_points?.name ?? '' }),
      );
    },

    async updateBooking(id, patch) {
      // .select() يضمن أن الصف تم تعديله فعلًا (RLS يعيد صفرًا لغير المسؤول)
      const rows = await run(sb.from('bookings').update(patch).eq('id', id).select('id'));
      if (!(rows as unknown[]).length) throw new ApiError('FORBIDDEN');
    },

    async listAudit(limit) {
      return (await run(
        sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit),
      )) as AuditEntry[];
    },
  };
}
