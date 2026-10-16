import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { useAsync } from '../../lib/hooks';
import type { PickupPoint, PickupPointInput } from '../../lib/types';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, Spinner, cx, useToast } from '../../components/ui';

export function PointsTab() {
  const toast = useToast();
  const points = useAsync(() => api.listPickupPoints(), []);
  const [editing, setEditing] = useState<PickupPointInput | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(p: PickupPoint) {
    setBusyId(p.id);
    try {
      await api.savePickupPoint({ ...p, is_active: !p.is_active });
      toast(p.is_active ? `تم إيقاف «${p.name}» — تبقى في الحجوزات السابقة.` : `تم تفعيل «${p.name}».`, 'success');
      void points.reload(true);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusyId(null);
    }
  }

  const list = points.data ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">نقاط التجمع</h2>
          <p className="text-muted">النقطة الموقوفة لا تظهر في الحجوزات الجديدة، وتبقى محفوظة في الحجوزات السابقة.</p>
        </div>
        <Button
          onClick={() =>
            setEditing({ name: '', description: '', is_active: true, sort_order: (list.at(-1)?.sort_order ?? 0) + 1 })
          }
        >
          إضافة نقطة تجمع
        </Button>
      </div>
      {points.error && <ErrorBox message={points.error} onRetry={() => void points.reload()} />}
      {points.loading && !points.data ? (
        <div className="flex justify-center p-10 text-muted">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="لا توجد نقاط تجمع">أضف نقطة واحدة على الأقل قبل إنشاء رحلة.</EmptyState>
      ) : (
        <Card className="divide-y divide-line">
          {list.map((p) => (
            <div key={p.id} className={cx('flex flex-wrap items-center gap-3 p-4', !p.is_active && 'bg-paper/60')}>
              <span className="w-8 text-center text-sm font-bold text-muted tabular-nums">{p.sort_order}</span>
              <div className="min-w-0 flex-1">
                <p className={cx('font-extrabold', !p.is_active && 'text-muted')}>{p.name}</p>
                {p.description && <p className="text-sm text-muted">{p.description}</p>}
              </div>
              {p.is_active ? <Badge tone="green">مفعّلة</Badge> : <Badge tone="gray">موقوفة</Badge>}
              <div className="flex gap-1">
                <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => setEditing({ ...p })}>
                  تعديل
                </Button>
                <Button variant="ghost" className="min-h-9 px-3 text-sm" loading={busyId === p.id} onClick={() => void toggle(p)}>
                  {p.is_active ? 'إيقاف' : 'تفعيل'}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      {editing && (
        <PointEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast(editing.id ? 'تم حفظ نقطة التجمع.' : 'تمت إضافة نقطة التجمع.', 'success');
            setEditing(null);
            void points.reload(true);
          }}
        />
      )}
    </div>
  );
}

function PointEditor({ initial, onClose, onSaved }: { initial: PickupPointInput; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (p.name.trim().length < 2) return setErr('اكتب اسم نقطة التجمع.');
    setBusy(true);
    setErr(null);
    try {
      await api.savePickupPoint({ ...p, description: p.description?.trim() || null });
      onSaved();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={initial.id ? 'تعديل نقطة التجمع' : 'نقطة تجمع جديدة'}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="اسم النقطة" htmlFor="pe-name">
          <Input id="pe-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} maxLength={80} placeholder="مثال: المعادي" />
        </Field>
        <Field label="وصف المكان" optional htmlFor="pe-desc" hint="يظهر للركاب بجانب اسم النقطة">
          <Input id="pe-desc" value={p.description ?? ''} onChange={(e) => setP({ ...p, description: e.target.value })} maxLength={200} placeholder="مثال: أمام محطة المترو" />
        </Field>
        <Field label="ترتيب الظهور" htmlFor="pe-order">
          <Input id="pe-order" type="number" value={p.sort_order} onChange={(e) => setP({ ...p, sort_order: parseInt(e.target.value || '0', 10) })} />
        </Field>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" className="size-4 accent-pine-700" checked={p.is_active} onChange={(e) => setP({ ...p, is_active: e.target.checked })} />
          مفعّلة للحجوزات الجديدة
        </label>
        {err && (
          <p role="alert" className="font-semibold text-red-700">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">
            {initial.id ? 'حفظ' : 'إضافة'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            تراجع
          </Button>
        </div>
      </form>
    </Modal>
  );
}
