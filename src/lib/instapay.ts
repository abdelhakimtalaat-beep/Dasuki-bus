/**
 * فتح تطبيق إنستاباي على الموبايل بعد نسخ رقم التحويل.
 *
 * - أندرويد: رابط intent يفتح التطبيق مباشرة (الحزمة com.egyptianbanks.instapay)،
 *   وإن لم يكن مثبتًا يفتح صفحته على Google Play.
 * - آيفون: لا يوفّر إنستاباي رابط فتح عامًّا موثّقًا، فنفتح صفحته على App Store
 *   وفيها زر «فتح» إن كان مثبتًا.
 * - الكمبيوتر: نسخ الرقم فقط.
 */
export const INSTAPAY_ANDROID_PACKAGE = 'com.egyptianbanks.instapay';
export const INSTAPAY_IOS_APP_ID = '1592108795';
export const INSTAPAY_PLAY_URL = `https://play.google.com/store/apps/details?id=${INSTAPAY_ANDROID_PACKAGE}`;
export const INSTAPAY_APPSTORE_URL = `https://apps.apple.com/eg/app/instapay-egypt/id${INSTAPAY_IOS_APP_ID}`;

export type MobileOS = 'android' | 'ios' | null;

export function detectMobileOS(userAgent: string, maxTouchPoints = 0): MobileOS {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  // iPadOS الحديث يعرّف نفسه كـ Mac لكنه يدعم اللمس
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return null;
}

export function instaPayAppLink(os: MobileOS): string | null {
  if (os === 'android')
    return (
      `intent://#Intent;package=${INSTAPAY_ANDROID_PACKAGE};` +
      'action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;' +
      `S.browser_fallback_url=${encodeURIComponent(INSTAPAY_PLAY_URL)};end`
    );
  if (os === 'ios') return INSTAPAY_APPSTORE_URL;
  return null;
}

export function currentMobileOS(): MobileOS {
  if (typeof navigator === 'undefined') return null;
  return detectMobileOS(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}
