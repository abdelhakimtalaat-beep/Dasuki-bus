import { formatMoney } from './format';

/** 01065553930 → 201065553930 (الصيغة الدولية التي يطلبها رابط واتساب) */
export function toWhatsAppNumber(egyptMobile: string): string {
  const d = egyptMobile.replace(/\D/g, '');
  return d.startsWith('0') ? '2' + d : d;
}

export interface PaymentDetails {
  name: string;
  seats: number;
  pickupPoint: string;
  /** اسم الرحلة كما يكتبه المسؤول */
  tripTitle?: string;
}

/** رابط واتساب برسالة جاهزة؛ الراكب يرفق صورة إيصال إنستاباي في المحادثة. */
export function whatsAppPaymentLink(number: string, seatPrice: number, d: PaymentDetails): string {
  const text = [
    'السلام عليكم،',
    `مرفق صورة تحويل إنستاباي لحجز ${d.tripTitle?.trim() || 'الرحلة'}.`,
    `الاسم: ${d.name}`,
    `عدد المقاعد: ${d.seats}`,
    `نقطة التجمع: ${d.pickupPoint}`,
    `المبلغ: ${formatMoney(d.seats * seatPrice)}`,
  ].join('\n');
  return `https://wa.me/${toWhatsAppNumber(number)}?text=${encodeURIComponent(text)}`;
}
