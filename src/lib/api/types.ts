import type {
  AppSettings,
  AdminSession,
  AuditEntry,
  Booking,
  BookingLookup,
  BookingPatch,
  BookingResult,
  MyBooking,
  NewBookingInput,
  PickupPoint,
  PickupPointInput,
  PublicBooking,
  Trip,
  TripInput,
  TripStats,
  TripStatus,
} from '../types';

/** واجهة الخادم الموحدة — لها تنفيذان: Supabase (الإنتاج) وتجريبي (معاينة فقط). */
export interface Api {
  readonly mode: 'supabase' | 'demo';

  // ---- عام ----
  listTrips(): Promise<Trip[]>;
  getTripPickupPoints(tripId: string): Promise<PickupPoint[]>;
  getStats(tripId: string): Promise<TripStats>;
  getPublicBookings(tripId: string): Promise<PublicBooking[]>;
  createBooking(input: NewBookingInput): Promise<BookingResult>;
  lookupBooking(code: string): Promise<BookingLookup | null>;
  /** الراكب يجد حجزه بالاسم + رقم الهاتف معًا */
  findMyBooking(tripId: string, fullName: string, phone: string): Promise<MyBooking>;
  updateMyBooking(tripId: string, fullName: string, phone: string, seats: number): Promise<void>;
  cancelMyBooking(tripId: string, fullName: string, phone: string): Promise<void>;
  /** يستدعي onChange عند أي تغيير في الرحلة/حجوزاتها. يرجع دالة لإلغاء الاشتراك. */
  subscribeTrip(tripId: string, onChange: () => void): () => void;
  /** اسم التطبيق وإعداداته العامة */
  getAppSettings(): Promise<AppSettings>;
  /** صورة أتوبيس الرحلة (data URL) أو null */
  getTripBusPhoto(tripId: string): Promise<string | null>;

  // ---- المصادقة ----
  getSession(): Promise<AdminSession | null>;
  signIn(email: string, password: string): Promise<AdminSession>;
  signOut(): Promise<void>;
  onAuthChange(cb: (s: AdminSession | null) => void): () => void;

  // ---- الإدارة (محمية على الخادم بـ RLS وفحص is_admin) ----
  listPickupPoints(): Promise<PickupPoint[]>;
  savePickupPoint(p: PickupPointInput): Promise<void>;
  saveTrip(id: string | null, data: TripInput, pointIds: string[]): Promise<string>;
  setTripStatus(id: string, status: TripStatus): Promise<void>;
  /** إخفاء الرحلة عن الحاجزين أو إظهارها */
  setTripHidden(id: string, hidden: boolean): Promise<void>;
  setAppName(name: string): Promise<string>;
  /** رقم الأتوبيس + صورة جديدة (أو حذف الصورة) لرحلة */
  setTripBus(id: string, busNumber: string, photo: string | null, removePhoto: boolean): Promise<void>;
  listBookings(tripId: string): Promise<Booking[]>;
  updateBooking(id: string, patch: BookingPatch): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;
}
