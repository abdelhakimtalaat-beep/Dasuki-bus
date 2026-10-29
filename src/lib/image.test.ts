import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, isImageFile } from './image';

test('تصغير أبعاد الصورة مع الحفاظ على النسبة', () => {
  assert.deepEqual(fitWithin(1691, 2184, 1000), { width: 774, height: 1000 });
  assert.deepEqual(fitWithin(4000, 3000, 1000), { width: 1000, height: 750 });
  assert.deepEqual(fitWithin(600, 800, 1000), { width: 600, height: 800 }, 'الصورة الصغيرة لا تُكبَّر');
});

test('التعرف على ملفات الصور', () => {
  assert.ok(isImageFile({ type: 'image/jpeg', name: 'bus.jpg' }));
  assert.ok(isImageFile({ type: '', name: 'IMG_0001.HEIC' }));
  assert.ok(!isImageFile({ type: 'application/pdf', name: 'bus.pdf' }));
});
