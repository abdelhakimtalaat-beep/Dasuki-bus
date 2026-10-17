import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { compressReceipt } from '../lib/receipt';
import { Spinner, cx } from './ui';

export interface ReceiptTarget {
  tripId: string;
  name: string;
  phone: string;
  /** وقت رفع إيصال سابق (إن وُجد) */
  uploadedAt?: string | null;
}

/**
 * رفع صورة إيصال إنستاباي من الموقع مباشرة.
 * الصورة تُضغط في المتصفح ثم تُرسل للخادم الذي يتحقق من الاسم + الهاتف.
 * تأكيد الدفع النهائي يتم من المسؤول بعد مراجعة الصورة ووصول المبلغ.
 */
export function ReceiptUpload({ target, onUploaded }: { target: ReceiptTarget; onUploaded?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>(target.uploadedAt ? 'done' : 'idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [at, setAt] = useState<string | null>(target.uploadedAt ?? null);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setState('working');
    setErr(null);
    try {
      const data = await compressReceipt(file);
      setPreview(data);
      const when = await api.uploadMyReceipt(target.tripId, target.name, target.phone, data);
      setAt(when);
      setState('done');
      onUploaded?.();
    } catch (e) {
      setErr(errorMessage(e));
      setState('error');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div data-testid="receipt-upload">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="اختر صورة إيصال التحويل"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {state === 'done' ? (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-pine-200 bg-white p-3">
          {preview && <img src={preview} alt="صورة الإيصال المرفوعة" className="h-20 w-14 shrink-0 rounded border border-line object-cover" />}
          <div className="min-w-0 text-[15px]">
            <p className="font-extrabold text-pine-800">✓ تم استلام صورة التحويل</p>
            <p className="mt-0.5 text-sm text-muted">
              {at && <>رُفعت {formatDateTime(at)}. </>}
              سيراجعها مسؤول الرحلة ويؤكد الدفع، وعندها يتحول لون مقاعدك إلى الأخضر الغامق.
            </p>
            <button
              type="button"
              className="mt-1 text-sm font-bold text-pine-700 underline underline-offset-4"
              onClick={() => input.current?.click()}
            >
              رفع صورة أخرى بدلًا منها
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={state === 'working'}
          onClick={() => input.current?.click()}
          className={cx(
            'flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-pine-600 bg-white px-4 font-bold text-pine-800 hover:bg-pine-50 disabled:opacity-70',
          )}
        >
          {state === 'working' ? (
            <>
              <Spinner /> جارٍ رفع الصورة…
            </>
          ) : (
            <>
              <CameraIcon /> ارفع صورة التحويل
            </>
          )}
        </button>
      )}
      {err && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {err}
        </p>
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
