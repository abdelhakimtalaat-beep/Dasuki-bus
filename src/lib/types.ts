export type TripStatus = 'open' | 'full' | 'closed' | 'cancelled';
export type BookingStatus = 'confirmed' | 'cancelled';

export interface Trip {
  id: string;
  title: string;
  trip_date: string; // YYYY-MM-DD
  departure_time: string; // HH:MM[:SS]
  departure_point: string;
  destination: string;
  capacity: number;
  max_seats_per_booking: number;
  seat_price: number;
  instapay_number: string | null;
  booked_seats: number;
  booking_opens_at: string; // ISO
  booking_closes_at: string; // ISO
  status: TripStatus;
  notes: string | null;
  announcements: string | null;
  route_stops: string | null;
  route_map_url: string | null;
  route_embed_url: string | null;
  /** مخفية عن الحاجزين (يراها المسؤول فقط) */
  is_hidden?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PickupPoint {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface PointBreakdown {
  pickup_point_id: string;
  name: string;
  bookings: number;
  seats: number;
}

export interface TripStats {
  trip_id: string;
  capacity: number;
  total_bookings: number;
  booked_seats: number;
  remaining_seats: number;
  occupancy_pct: number;
  paid_seats: number;
  paid_bookings: number;
  seat_price: number;
  expected_amount: number;
  paid_amount: number;
  pickup_points_used: number;
  cancelled_bookings: number;
  by_pickup_point: PointBreakdown[];
}

export interface PublicBooking {
  row_no: number;
  display_name: string;
  seats: number;
  pickup_point_name: string;
  created_at: string;
  is_paid: boolean;
}

export interface Booking {
  id: string;
  booking_code: string;
  trip_id: string;
  full_name: string;
  seats: number;
  pickup_point_id: string;
  pickup_point_name: string;
  phone: string | null;
  notes: string | null;
  status: BookingStatus;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

export interface NewBookingInput {
  trip_id: string;
  full_name: string;
  seats: number;
  pickup_point_id: string;
  phone: string | null;
  notes: string | null;
  client_request_id: string;
}

export interface BookingResult {
  booking_code: string;
  full_name: string;
  seats: number;
  pickup_point_name: string;
  created_at: string;
  remaining_seats: number;
  already_existed: boolean;
}

export interface BookingLookup {
  booking_code: string;
  full_name: string;
  seats: number;
  pickup_point_name: string;
  status: BookingStatus;
  created_at: string;
  trip_title: string;
  trip_date: string;
  departure_time: string;
  trip_status: TripStatus;
  is_paid: boolean;
  amount: number;
  instapay_number: string | null;
}

/** حجز الراكب كما يراه هو (بعد التحقق بالاسم + الهاتف) */
export interface MyBooking {
  full_name: string;
  seats: number;
  pickup_point_name: string;
  notes: string | null;
  is_paid: boolean;
  created_at: string;
  /** أقصى عدد مقاعد يمكن الوصول إليه الآن (حد الحجز الواحد أو المتاح) */
  max_seats: number;
  /** سبب منع التعديل إن وجد: PAID_LOCKED | BOOKING_CLOSED | ... */
  locked_reason: string | null;
}

export interface TripInput {
  title: string;
  trip_date: string;
  departure_time: string;
  departure_point: string;
  destination: string;
  capacity: number;
  max_seats_per_booking: number;
  seat_price: number;
  instapay_number: string | null;
  booking_opens_at: string; // ISO
  booking_closes_at: string; // ISO
  status: TripStatus;
  notes: string | null;
  announcements: string | null;
  route_stops: string | null;
  route_map_url: string | null;
  route_embed_url: string | null;
}

export interface BookingPatch {
  full_name?: string;
  seats?: number;
  pickup_point_id?: string;
  phone?: string | null;
  notes?: string | null;
  status?: BookingStatus;
  is_paid?: boolean;
}

export interface PickupPointInput {
  id?: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface AuditEntry {
  id: number;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminSession {
  email: string;
  isAdmin: boolean;
}
