import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-pine-700 text-white hover:bg-pine-800 active:bg-pine-900 disabled:bg-pine-700/50',
    secondary: 'bg-white text-pine-800 border border-pine-200 hover:bg-pine-50 disabled:opacity-50',
    ghost: 'text-pine-800 hover:bg-pine-50 disabled:opacity-50',
    danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50',
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 font-bold transition-colors disabled:cursor-not-allowed',
        'min-h-11 text-[15px]',
        styles[variant],
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ------------------------------------------------------------------ Fields
export function Field({
  label,
  hint,
  error,
  optional,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[15px] font-bold text-ink">
        {label}
        {optional && <span className="ms-1.5 text-sm font-normal text-muted">(اختياري)</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const inputBase =
  'w-full rounded-lg border bg-white px-3.5 text-[16px] text-ink placeholder:text-muted/70 transition-colors ' +
  'focus:border-pine-600 focus:outline-none focus:ring-2 focus:ring-pine-600/25 disabled:bg-paper';

export function Input({ invalid, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(inputBase, 'h-12', invalid ? 'border-red-400' : 'border-line', className)}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(inputBase, 'h-12 appearance-none bg-no-repeat pe-3.5 ps-10', invalid ? 'border-red-400' : 'border-line', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none' stroke='%23157a46' stroke-width='2'%3E%3Cpath d='M5 8l5 5 5-5'/%3E%3C/svg%3E\")",
        backgroundPosition: 'left 0.75rem center',
      }}
    >
      {children}
    </select>
  );
}

export function Textarea({
  invalid,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(inputBase, 'min-h-20 py-2.5', invalid ? 'border-red-400' : 'border-line', className)}
    />
  );
}

// ------------------------------------------------------------------ Card / Badge
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-2xl bg-white shadow-card', className)}>{children}</section>;
}

export function Badge({ tone, children }: { tone: 'green' | 'amber' | 'gray' | 'red'; children: ReactNode }) {
  const t = {
    green: 'bg-pine-100 text-pine-800',
    amber: 'bg-brass-100 text-brass-700',
    gray: 'bg-gray-100 text-gray-700',
    red: 'bg-red-50 text-red-700',
  }[tone];
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-bold', t)}>{children}</span>;
}

// ------------------------------------------------------------------ Modal
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-pine-950/50',
        wide ? 'max-w-2xl' : 'max-w-md',
      )}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-xl font-extrabold">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="-m-1 rounded-lg p-1.5 text-muted hover:bg-paper"
              aria-label="إغلاق"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// ------------------------------------------------------------------ Toasts
type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}
const ToastCtx = createContext<(text: string, tone?: ToastTone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, tone, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 text-[15px] font-semibold shadow-lg',
              t.tone === 'success' && 'bg-pine-800 text-white',
              t.tone === 'error' && 'bg-red-700 text-white',
              t.tone === 'info' && 'bg-ink text-white',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ Misc
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
      <p className="font-bold text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
      <p className="font-semibold">{message}</p>
      {onRetry && (
        <Button variant="danger" onClick={onRetry} className="min-h-9">
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}
