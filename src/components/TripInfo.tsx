import type { Trip } from '../lib/types';
import { Card } from './ui';
import { lines, safeGoogleEmbed, safeHttps } from '../lib/links';

export { lines, safeGoogleEmbed, safeHttps };

/** صندوق التنبيهات المهمة — يظهر أعلى صفحة الحجز. */
export function Announcements({ trip, compact }: { trip: Trip; compact?: boolean }) {
  const items = lines(trip.announcements);
  if (!items.length) return null;
  return (
    <section
      aria-labelledby="notices-title"
      className={
        compact
          ? 'rounded-xl border border-brass-500/40 bg-brass-100/60 p-3'
          : 'rounded-2xl border-2 border-brass-500/50 bg-brass-100 p-4 shadow-card sm:p-5'
      }
    >
      <h2 id="notices-title" className={compact ? 'text-sm font-extrabold text-brass-700' : 'flex items-center gap-2 text-lg font-extrabold text-brass-700'}>
        {!compact && (
          <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M12 3l9.5 17h-19L12 3z" strokeLinejoin="round" />
            <path d="M12 10v4.5M12 17.5v.01" strokeLinecap="round" />
          </svg>
        )}
        {compact ? 'تذكير' : 'تنبيهات مهمة'}
      </h2>
      <ul className={compact ? 'mt-1 flex flex-col gap-1 text-sm text-ink' : 'mt-2 flex flex-col gap-1.5 text-[16px] font-semibold text-ink'}>
        {items.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-brass-700" aria-hidden="true" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** مسار الرحلة كمحطات متتابعة + الخريطة المضمّنة + زر فتح المسار في خرائط جوجل. */
export function RouteCard({ trip }: { trip: Trip }) {
  const stops = lines(trip.route_stops);
  const mapUrl = safeHttps(trip.route_map_url);
  const embed = safeGoogleEmbed(trip.route_embed_url);
  if (!stops.length && !mapUrl && !embed) return null;

  return (
    <Card className="p-5 sm:p-7">
      <h2 className="text-xl font-extrabold">مسار الرحلة</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {stops.length > 0 && (
          <ol className="relative flex flex-col" aria-label="محطات الرحلة بالترتيب">
            {stops.map((s, i) => {
              const first = i === 0;
              const last = i === stops.length - 1;
              return (
                <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                  {!last && <span className="absolute top-7 bottom-0 start-[13px] w-0.5 bg-pine-200" aria-hidden="true" />}
                  <span
                    className={
                      first || last
                        ? 'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-pine-800 text-sm font-extrabold text-white'
                        : 'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-pine-600 bg-white text-sm font-extrabold text-pine-800'
                    }
                  >
                    {i + 1}
                  </span>
                  <span className="pt-0.5">
                    <span className={first || last ? 'font-extrabold' : 'font-semibold'}>{s}</span>
                    {first && <span className="block text-sm text-muted">نقطة الانطلاق</span>}
                    {last && <span className="block text-sm text-muted">آخر محطة</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {(embed || mapUrl) && (
          <div className="flex min-w-0 flex-col gap-3">
            {embed && (
              <div className="overflow-hidden rounded-xl border border-line bg-pine-50">
                <iframe
                  title="خريطة مسار الرحلة"
                  src={embed}
                  className="block aspect-[4/3] w-full max-w-full sm:aspect-[16/10]"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            )}
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-pine-700 px-4 font-bold text-white hover:bg-pine-800"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z" />
                  <circle cx="12" cy="10" r="2.3" />
                </svg>
                افتح المسار في خرائط جوجل
              </a>
            )}
            {mapUrl && (
              <p className="text-center text-sm text-muted">يفتح في تطبيق الخرائط على هاتفك لمتابعة المسار مباشرة أثناء الرحلة.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
