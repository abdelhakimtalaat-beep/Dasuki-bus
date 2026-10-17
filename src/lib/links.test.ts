import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lines, safeGoogleEmbed, safeHttps } from './links';

test('تقسيم التنبيهات والمسار إلى أسطر', () => {
  assert.deepEqual(lines('الشروق\r\n  الطريق الإقليمي \n\nدسوق'), ['الشروق', 'الطريق الإقليمي', 'دسوق']);
  assert.deepEqual(lines(null), []);
});

test('الروابط الآمنة فقط', () => {
  assert.equal(safeHttps('https://maps.app.goo.gl/Z9rYgAv3Hp94hX7t5'), 'https://maps.app.goo.gl/Z9rYgAv3Hp94hX7t5');
  assert.equal(safeHttps('javascript:alert(1)'), null);
  assert.equal(safeHttps('http://example.com'), null);
  assert.ok(safeGoogleEmbed('https://maps.google.com/maps?saddr=1,2&daddr=3,4&output=embed'));
  assert.ok(safeGoogleEmbed('https://www.google.com/maps/embed?pb=xyz'));
  assert.equal(safeGoogleEmbed('https://evil.com/maps'), null);
  assert.equal(safeGoogleEmbed('https://google.com.evil.com/maps'), null);
});

import { normalizeArabic } from './text';
import { toWhatsAppNumber } from './whatsapp';

test('البحث بالاسم يتجاهل اختلاف الهمزات والتاء المربوطة', () => {
  assert.ok(normalizeArabic('أحمد عبد الله').includes(normalizeArabic('احمد')));
  assert.ok(normalizeArabic('فاطمة إبراهيم').includes(normalizeArabic('ابراهيم')));
  assert.ok(normalizeArabic('مصطفى').includes(normalizeArabic('مصطفي')));
  assert.ok(normalizeArabic('فاطمة').includes(normalizeArabic('فاطمه')));
});

test('رقم واتساب بالصيغة الدولية', () => {
  assert.equal(toWhatsAppNumber('01065553930'), '201065553930');
});

import { whatsAppPaymentLink } from './whatsapp';
test('رابط واتساب برسالة جاهزة', () => {
  const url = whatsAppPaymentLink('01065553930', 300, { name: 'عبد الحكيم طلعت', seats: 2, pickupPoint: 'الشروق' });
  assert.ok(url.startsWith('https://wa.me/201065553930?text='));
  const text = decodeURIComponent(url.split('text=')[1]);
  assert.match(text, /عبد الحكيم طلعت/);
  assert.match(text, /600 جنيه/);
  assert.match(text, /الشروق/);
});
