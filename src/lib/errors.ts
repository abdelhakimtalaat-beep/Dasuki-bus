import { seatsWord } from './format';

/** خطأ موحد يحمل رمزًا من الخادم (مثل NOT_ENOUGH_SEATS) وتفاصيل اختيارية. */
export class ApiError extends Error {
  constructor(
    public code: string,
    public detail?: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

const KNOWN_CODES = [
  'NOT_ENOUGH_SEATS',
  'BUS_FULL',
  'BOOKING_CLOSED',
  'BOOKING_NOT_OPEN_YET',
  'TRIP_CANCELLED',
  'TRIP_NOT_FOUND',
  'INVALID_PICKUP_POINT',
  'PICKUP_REQUIRED',
  'INVALID_PHONE',
  'INVALID_NAME',
  'INVALID_SEATS',
  'INVALID_NOTES',
  'MAX_SEATS_PER_BOOKING',
  'PICKUP_POINT_IN_USE',
  'TRIP_CHANGE_NOT_ALLOWED',
  'FORBIDDEN',
  'trips_capacity_chk',
  'trips_window_chk',
  'pickup_points_name_uq',
  'capacity_check',
  'PHONE_REQUIRED',
  'DUPLICATE_NAME',
  'DUPLICATE_PHONE',
  'BOOKING_NOT_FOUND',
  'PAID_LOCKED',
  'instapay_number_check',
  'INVALID_APP_NAME',
  'INVALID_BUS_NUMBER',
  'PHOTO_TOO_LARGE',
  'INVALID_PHOTO',
] as const;

/** يحوّل أي خطأ (من Supabase أو الشبكة) إلى ApiError برمز معروف. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const e = err as { message?: string; details?: string; code?: string; status?: number } | null;
  const text = `${e?.message ?? ''} ${e?.details ?? ''}`;
  for (const code of KNOWN_CODES) {
    if (text.includes(code)) {
      const detail = e?.details && /^\d+$/.test(e.details.trim()) ? e.details.trim() : undefined;
      return new ApiError(code, detail);
    }
  }
  if (e?.code === '42501' || text.includes('permission denied') || text.includes('row-level security')) {
    return new ApiError('FORBIDDEN');
  }
  if (e?.code === '23505') return new ApiError('DUPLICATE');
  if (text.includes('Invalid login credentials')) return new ApiError('INVALID_LOGIN');
  if (
    err instanceof TypeError ||
    text.includes('Failed to fetch') ||
    text.includes('NetworkError') ||
    text.includes('fetch failed')
  ) {
    return new ApiError('NETWORK');
  }
  return new ApiError('UNKNOWN', e?.message);
}

/** رسالة عربية واضحة لكل حالة. */
export function errorMessage(err: unknown): string {
  const { code, detail } = toApiError(err);
  switch (code) {
    case 'NOT_ENOUGH_SEATS': {
      const n = Number(detail ?? 0);
      return n > 0
        ? `عدد المقاعد المطلوبة أكبر من المتاح. المتاح حاليًا ${seatsWord(n)} فقط.`
        : 'عدد المقاعد المطلوبة أكبر من المتاح.';
    }
    case 'BUS_FULL':
      return 'اكتملت سعة الأتوبيس لهذه الرحلة.';
    case 'BOOKING_CLOSED':
      return 'انتهت فترة الحجز لهذه الرحلة.';
    case 'BOOKING_NOT_OPEN_YET':
      return 'لم يبدأ الحجز لهذه الرحلة بعد.';
    case 'TRIP_CANCELLED':
      return 'هذه الرحلة ملغاة.';
    case 'TRIP_NOT_FOUND':
      return 'الرحلة غير موجودة.';
    case 'INVALID_PICKUP_POINT':
      return 'نقطة التجمع المختارة غير متاحة لهذه الرحلة. اختر نقطة أخرى.';
    case 'PICKUP_REQUIRED':
      return 'يرجى اختيار نقطة التجمع.';
    case 'PHONE_REQUIRED':
      return 'رقم الهاتف مطلوب للحجز.';
    case 'DUPLICATE_NAME':
      return 'يوجد حجز مسجّل بنفس الاسم في هذه الرحلة. إن كان حجزك فعدّله من «عدّل حجزك»، وإن كان شخصًا آخر فاكتب الاسم رباعيًا.';
    case 'DUPLICATE_PHONE':
      return 'رقم الهاتف هذا مسجّل في حجز آخر لهذه الرحلة. لتغيير عدد المقاعد استخدم «عدّل حجزك».';
    case 'BOOKING_NOT_FOUND':
      return 'لم نجد حجزًا بهذا الاسم ورقم الهاتف. اكتبهما كما سجلتهما وقت الحجز.';
    case 'PAID_LOCKED':
      return 'حجزك مؤكد الدفع، لذا يتم تعديله عن طريق مسؤول الرحلة.';
    case 'INVALID_APP_NAME':
      return 'اسم التطبيق يجب أن يكون من 2 إلى 80 حرفًا.';
    case 'INVALID_BUS_NUMBER':
      return 'رقم الأتوبيس طويل جدًا (40 حرفًا كحد أقصى).';
    case 'PHOTO_TOO_LARGE':
      return 'حجم الصورة كبير جدًا. جرّب صورة أخرى.';
    case 'INVALID_PHOTO':
      return 'الملف المختار ليس صورة. اختر صورة JPG أو PNG.';
    case 'INVALID_PHONE':
      return 'رقم الهاتف غير صحيح. اكتب رقمًا مصريًا من 11 رقمًا يبدأ بـ 010 أو 011 أو 012 أو 015.';
    case 'INVALID_NAME':
      return 'اكتب الاسم الكامل (3 أحرف على الأقل).';
    case 'INVALID_SEATS':
      return 'عدد المقاعد يجب أن يكون 1 على الأقل.';
    case 'INVALID_NOTES':
      return 'الملاحظات طويلة جدًا (500 حرف كحد أقصى).';
    case 'MAX_SEATS_PER_BOOKING':
      return `الحد الأقصى للحجز الواحد ${seatsWord(Number(detail ?? 0))}. للحجز الأكبر تواصل مع مسؤول الرحلة.`;
    case 'PICKUP_POINT_IN_USE':
      return 'لا يمكن إزالة نقطة تجمع عليها حجوزات مؤكدة في هذه الرحلة.';
    case 'trips_capacity_chk':
      return 'لا يمكن تقليل سعة الرحلة لأقل من عدد المقاعد المحجوزة فعلًا.';
    case 'capacity_check':
      return 'سعة الرحلة يجب أن تكون بين 1 و 50 مقعدًا.';
    case 'instapay_number_check':
      return 'رقم إنستاباي غير صحيح. اكتب رقمًا مصريًا من 11 رقمًا.';
    case 'trips_window_chk':
      return 'موعد إغلاق الحجز يجب أن يكون بعد موعد فتحه.';
    case 'pickup_points_name_uq':
    case 'DUPLICATE':
      return 'يوجد عنصر بنفس الاسم بالفعل.';
    case 'FORBIDDEN':
      return 'ليست لديك صلاحية لتنفيذ هذا الإجراء.';
    case 'INVALID_LOGIN':
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    case 'NETWORK':
      return 'تعذر الاتصال بالخادم؛ يرجى المحاولة مرة أخرى.';
    default:
      return 'حدث خطأ غير متوقع؛ يرجى المحاولة مرة أخرى.';
  }
}
