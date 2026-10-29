import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { setAppNameLocal, useAppName } from '../../lib/appSettings';
import { Button, Card, Field, Input, useToast } from '../../components/ui';

/** إعدادات عامة: اسم التطبيق الظاهر أعلى صفحة الحجز ولوحة التحكم. */
export function SettingsTab() {
  const toast = useToast();
  const current = useAppName();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setName(current), [current]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const v = name.replace(/\s+/g, ' ').trim();
    if (v.length < 2 || v.length > 80) return setErr('اسم التطبيق يجب أن يكون من 2 إلى 80 حرفًا.');
    setBusy(true);
    try {
      const saved = await api.setAppName(v);
      setAppNameLocal(saved || v);
      toast('تم حفظ اسم التطبيق.', 'success');
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h2 className="text-2xl font-extrabold">الإعدادات</h2>
        <p className="text-muted">صورة الأتوبيس ورقمه تُضاف لكل رحلة على حدة من تبويب «الرحلات».</p>
      </div>
      <Card className="p-5">
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="اسم التطبيق" htmlFor="app-name" hint="يظهر أعلى صفحة الحجز وفي عنوان المتصفح ولوحة التحكم.">
            <Input id="app-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          {err && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              {err}
            </p>
          )}
          <div>
            <Button type="submit" loading={busy} disabled={name.trim() === current}>
              حفظ الاسم
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
