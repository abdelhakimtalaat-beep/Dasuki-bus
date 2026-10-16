import { useState } from 'react';
import { formatMoney, seatsWord } from '../lib/format';
import { cx } from './ui';

/** زر نسخ بسيط مع رجوع آمن إذا رفض المتصفح الوصول للحافظة. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cx('text-sm font-bold text-pine-700 underline underline-offset-4', className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* الرقم ظاهر ويمكن تحديده يدويًا */
        }
      }}
    >
      {done ? 'تم النسخ' : label}
    </button>
  );
}

/**
 * بطاقة الدفع عبر إنستاباي.
 * - بدون مبلغ: تعرض سعر المقعد فقط (في صفحة الحجز).
 * - مع مبلغ ورقم حجز: تعرض المطلوب تحويله بعد الحجز.
 */
export function InstaPayBox({
  number,
  seatPrice,
  seats,
  bookingCode,
  compact,
}: {
  number: string | null;
  seatPrice: number;
  seats?: number;
  bookingCode?: string;
  compact?: boolean;
}) {
  const amount = seats ? seats * seatPrice : null;
  return (
    <div className={cx('rounded-xl border border-pine-200 bg-pine-50', compact ? 'p-3' : 'p-4')}>
      {amount !== null ? (
        <p className="text-[15px] text-ink">
          المطلوب تحويله: <b className="text-lg tabular-nums">{formatMoney(amount)}</b>
          <span className="text-muted">
            {' '}
            ({seatsWord(seats!)} × {formatMoney(seatPrice)})
          </span>
        </p>
      ) : (
        <p className="text-[15px] text-ink">
          سعر التذكرة <b className="tabular-nums">{formatMoney(seatPrice)}</b> للمقعد الواحد
        </p>
      )}
      {number && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-[15px]">
            الدفع على إنستاباي:{' '}
            <b dir="ltr" className="text-lg tracking-wide tabular-nums select-all">
              {number}
            </b>
          </p>
          <CopyButton text={number} label="نسخ الرقم" />
        </div>
      )}
      <p className="mt-2 text-sm text-muted">
        {bookingCode ? (
          <>
            اكتب رقم الحجز <b dir="ltr">{bookingCode}</b> في ملاحظة التحويل. بعد مراجعة التحويل يؤكد المسؤول الدفع، ويتحول
            لون مقاعدك في المخطط إلى الأخضر الغامق.
          </>
        ) : (
          'احجز أولًا ثم حوّل قيمة التذكرة. يتحول لون مقاعدك للأخضر الغامق بعد تأكيد الدفع.'
        )}
      </p>
    </div>
  );
}
