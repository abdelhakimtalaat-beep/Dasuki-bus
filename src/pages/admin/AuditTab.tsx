import { api } from '../../lib/api';
import { formatDateTime, STATUS_LABEL } from '../../lib/format';
import type { TripStatus } from '../../lib/types';
import { useAsync } from '../../lib/hooks';
import type { AuditEntry } from '../../lib/types';
import { Button, Card, EmptyState, ErrorBox, Spinner } from '../../components/ui';

const ENTITY: Record<string, string> = { bookings: 'حجز', trips: 'رحلة', pickup_points: 'نقطة تجمع' };
const ACTION: Record<string, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  cancel: 'إلغاء',
  restore: 'استعادة',
  paid: 'تأكيد دفع',
  unpaid: 'إلغاء تأكيد دفع',
  receipt: 'رفع إيصال دفع',
  delete: 'حذف',
};

function describe(e: AuditEntry): string {
  const d = (e.new_data ?? e.old_data ?? {}) as Record<string, unknown>;
  if (e.entity === 'bookings') {
    const parts = [`${d.full_name ?? ''}`, `${d.seats ?? ''} مقعد`];
    if (e.action === 'update' && e.old_data && e.new_data) {
      const changed = ['full_name', 'seats', 'pickup_point_id', 'phone', 'notes'].filter(
        (k) => JSON.stringify(e.old_data![k]) !== JSON.stringify(e.new_data![k]),
      );
      const names: Record<string, string> = {
        full_name: 'الاسم',
        seats: 'عدد المقاعد',
        pickup_point_id: 'نقطة التجمع',
        phone: 'الهاتف',
        notes: 'الملاحظات',
      };
      if (changed.length) parts.push(`(تغيّر: ${changed.map((k) => names[k]).join('، ')})`);
      if (changed.includes('seats')) parts.push(`${e.old_data.seats} ← ${e.new_data.seats}`);
    }
    return parts.filter(Boolean).join(' — ');
  }
  if (e.entity === 'trips') {
    const st = e.old_data && e.new_data && e.old_data.status !== e.new_data.status ? ` (الحالة: ${STATUS_LABEL[e.old_data.status as TripStatus]} ← ${STATUS_LABEL[e.new_data.status as TripStatus]})` : '';
    return `رحلة ${d.trip_date ?? ''}${st}`;
  }
  return `${d.name ?? ''}${d.is_active === false ? ' (موقوفة)' : ''}`;
}

export function AuditTab() {
  const log = useAsync(() => api.listAudit(200), []);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">سجل العمليات</h2>
          <p className="text-muted">آخر 200 عملية — يُسجَّل تلقائيًا داخل قاعدة البيانات ولا يمكن تعديله من الواجهة.</p>
        </div>
        <Button variant="secondary" onClick={() => void log.reload()}>
          تحديث
        </Button>
      </div>
      {log.error && <ErrorBox message={log.error} onRetry={() => void log.reload()} />}
      {log.loading && !log.data ? (
        <div className="flex justify-center p-10 text-muted">
          <Spinner />
        </div>
      ) : !log.data?.length ? (
        <EmptyState title="لا توجد عمليات مسجلة بعد" />
      ) : (
        <Card className="divide-y divide-line">
          {log.data.map((e) => (
            <div key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-[15px]">
              <span className="w-28 shrink-0 text-sm text-muted">{formatDateTime(e.created_at)}</span>
              <span className="w-32 shrink-0 font-extrabold">
                {ACTION[e.action] ?? e.action} {ENTITY[e.entity] ?? e.entity}
              </span>
              <span className="min-w-0 flex-1">{describe(e)}</span>
              <span className="text-sm text-muted" dir="ltr">
                {e.actor_email ?? 'زائر (الحجز العام)'}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
