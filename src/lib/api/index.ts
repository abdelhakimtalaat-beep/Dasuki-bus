import type { Api } from './types';
import { createSupabaseApi } from './supabase';
import { createDemoApi } from './demo';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const forceDemo = import.meta.env.VITE_DEMO_MODE === 'true';

/**
 * يُستخدم Supabase تلقائيًا عند ضبط المتغيرات.
 * بدونها يعمل التطبيق في "الوضع التجريبي" مع شريط تحذير واضح أعلى الصفحة.
 */
export const api: Api = !forceDemo && url && key ? createSupabaseApi(url, key) : createDemoApi();
export type { Api };
