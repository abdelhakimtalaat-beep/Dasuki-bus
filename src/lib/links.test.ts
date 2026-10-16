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
