import { useState } from 'react';
import { formatMoney, seatsWord } from '../lib/format';
import { cx } from './ui';
import { whatsAppPaymentLink, type PaymentDetails } from '../lib/whatsapp';
import { currentMobileOS, instaPayAppLink } from '../lib/instapay';

export { whatsAppPaymentLink };
export type { PaymentDetails };

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
 * زر الدفع على الموبايل: ينسخ رقم إنستاباي ثم يفتح التطبيق مباشرة
 * (أندرويد: التطبيق نفسه أو صفحته على Google Play — آيفون: صفحته على App Store بزر «فتح»).
 * على الكمبيوتر يكتفي بالنسخ.
 */
export function InstaPayOpenButton({ number }: { number: string }) {
  const os = currentMobileOS();
  const link = instaPayAppLink(os);
  const [copied, setCopied] = useState<boolean | null>(null);

  if (!link) return <CopyButton text={number} label="نسخ الرقم" />;

  return (
    <div className="mt-3">
      <button
        type="button"
        data-testid="instapay-open"
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#4b1f7a] px-4 font-bold text-white hover:bg-[#3c1862]"
        onClick={async () => {
          let ok = false;
          try {
            await navigator.clipboard.writeText(number);
            ok = true;
          } catch {
            /* بعض المتصفحات ترفض الحافظة — الرقم ظاهر ويمكن نسخه يدويًا */
          }
          setCopied(ok);
          // مهلة قصيرة ليرى المستخدم تأكيد النسخ قبل الانتقال للتطبيق
          setTimeout(() => {
            window.location.href = link;
          }, 350);
        }}
      >
        انسخ الرقم وافتح إنستاباي
      </button>
      <p role="status" className="mt-1.5 text-sm text-muted">
        {copied === true
          ? 'تم نسخ الرقم ✓ — الصقه في خانة رقم الموبايل داخل إنستاباي واكتب المبلغ.'
          : copied === false
            ? `انسخ الرقم يدويًا: ${number}`
            : os === 'ios'
              ? 'ينسخ الرقم ثم يفتح صفحة إنستاباي على App Store — اضغط «فتح».'
              : 'ينسخ الرقم ثم يفتح تطبيق إنستاباي مباشرة.'}
      </p>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A9.9 9.9 0 1 0 12.04 2zm0 18.1c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3a8.2 8.2 0 1 1 6.9 3.8zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.1-1.2-.2-.2-.4-.3z" />
    </svg>
  );
}

/**
 * بطاقة الدفع عبر إنستاباي.
 * - قبل الحجز: المبلغ المطلوب ورقم إنستاباي وخطوات الدفع.
 * - بعد الحجز (details): زر واتساب لإرسال صورة إيصال التحويل برسالة جاهزة.
 */
export function InstaPayBox({
  number,
  seatPrice,
  seats,
  details,
  compact,
}: {
  number: string | null;
  seatPrice: number;
  seats?: number;
  details?: PaymentDetails;
  compact?: boolean;
}) {
  const count = details?.seats ?? seats;
  const amount = count ? count * seatPrice : null;
  return (
    <div className={cx('rounded-xl border border-pine-200 bg-pine-50', compact ? 'p-3' : 'p-4')}>
      {amount !== null ? (
        <p className="text-[15px] text-ink">
          المطلوب تحويله: <b className="text-lg tabular-nums">{formatMoney(amount)}</b>
          <span className="text-muted">
            {' '}
            ({seatsWord(count!)} × {formatMoney(seatPrice)})
          </span>
        </p>
      ) : (
        <p className="text-[15px] text-ink">
          سعر التذكرة <b className="tabular-nums">{formatMoney(seatPrice)}</b> للمقعد الواحد
        </p>
      )}
      {number && (
        <>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-[15px]">
              الدفع على إنستاباي:{' '}
              <b dir="ltr" className="text-lg tracking-wide tabular-nums select-all">
                {number}
              </b>
            </p>
            {!details && <CopyButton text={number} label="نسخ الرقم" />}
          </div>
          {details ? (
            <>
              <InstaPayOpenButton number={number} />
              <p className="mt-3 text-[15px] font-bold text-ink">
                بعد التحويل أرسل صورة إيصال إنستاباي على واتساب لنفس الرقم:
              </p>
              <a
                href={whatsAppPaymentLink(number, seatPrice, details)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#1f9e4f] px-4 font-bold text-white hover:bg-[#188341]"
              >
                <WhatsAppIcon />
                أرسل صورة التحويل على واتساب
              </a>
              <p className="mt-2 text-sm text-muted">
                تفتح المحادثة برسالة جاهزة فيها اسمك والمبلغ — أرفق صورة الإيصال واضغط إرسال. بعد مراجعة التحويل يؤكد
                المسؤول الدفع، ويتحول لون مقاعدك إلى الأخضر الغامق.
              </p>
            </>
          ) : (
            <ol className="mt-2 list-inside list-decimal text-sm text-muted">
              <li>سجّل الحجز أولًا.</li>
              <li>حوّل المبلغ على رقم إنستاباي.</li>
              <li>أرسل صورة الإيصال على واتساب لنفس الرقم (يظهر لك زر جاهز بعد الحجز).</li>
            </ol>
          )}
        </>
      )}
    </div>
  );
}
