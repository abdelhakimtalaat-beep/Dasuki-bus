/** يحوّل نصًا متعدد الأسطر إلى بنود (سطر لكل بند). */
export function lines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** يقبل فقط روابط https آمنة (حماية إضافية فوق قيود قاعدة البيانات). */
export function safeHttps(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** يقبل فقط روابط تضمين خرائط جوجل. */
export function safeGoogleEmbed(url: string | null | undefined): string | null {
  const u = safeHttps(url);
  if (!u) return null;
  const host = new URL(u).hostname;
  return /^(www\.|maps\.)?google\.com$/.test(host) && new URL(u).pathname.startsWith('/maps') ? u : null;
}
