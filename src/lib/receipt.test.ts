import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, isImageFile } from './receipt';

test('تصغير أبعاد صورة الإيصال مع الحفاظ على النسبة', () => {
  assert.deepEqual(fitWithin(1080, 2400, 1400), { width: 630, height: 1400 });
  assert.deepEqual(fitWithin(4000, 3000, 1400), { width: 1400, height: 1050 });
  assert.deepEqual(fitWithin(600, 800, 1400), { width: 600, height: 800 }, 'الصورة الصغيرة لا تُكبَّر');
});

test('التعرف على ملفات الصور', () => {
  assert.ok(isImageFile({ type: 'image/jpeg', name: 'a.jpg' }));
  assert.ok(isImageFile({ type: '', name: 'IMG_0001.HEIC' }));
  assert.ok(!isImageFile({ type: 'application/pdf', name: 'receipt.pdf' }));
});
