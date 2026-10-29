import { useEffect, useState } from 'react';
import { api } from './api';

/** اسم التطبيق الافتراضي (يغيّره المسؤول من لوحة التحكم ← الإعدادات). */
export const DEFAULT_APP_NAME = 'باص الشروق والعبور';
const CACHE_KEY = 'app-name-v1';

function readCache(): string {
  try {
    return localStorage.getItem(CACHE_KEY) || DEFAULT_APP_NAME;
  } catch {
    return DEFAULT_APP_NAME;
  }
}

let current = readCache();
let requested = false;
const subscribers = new Set<(name: string) => void>();

export function setAppNameLocal(name: string): void {
  current = name;
  try {
    localStorage.setItem(CACHE_KEY, name);
  } catch {
    /* ignore */
  }
  subscribers.forEach((f) => f(name));
}

/** اسم التطبيق الحالي — يُقرأ مرة واحدة من الخادم ويُحفظ مؤقتًا لظهور أسرع. */
export function useAppName(): string {
  const [name, setName] = useState(current);
  useEffect(() => {
    subscribers.add(setName);
    if (!requested) {
      requested = true;
      api
        .getAppSettings()
        .then((s) => s?.app_name && setAppNameLocal(s.app_name))
        .catch(() => {
          requested = false; // قاعدة بيانات قديمة أو انقطاع: يبقى الاسم الافتراضي
        });
    }
    return () => {
      subscribers.delete(setName);
    };
  }, []);
  return name;
}
