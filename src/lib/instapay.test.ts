import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMobileOS, instaPayAppLink, INSTAPAY_APPSTORE_URL } from './instapay';

test('التعرف على نوع الموبايل', () => {
  assert.equal(detectMobileOS('Mozilla/5.0 (Linux; Android 14; SM-A546E) Chrome/129 Mobile'), 'android');
  assert.equal(detectMobileOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari'), 'ios');
  assert.equal(detectMobileOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5), 'ios');
  assert.equal(detectMobileOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0), null);
  assert.equal(detectMobileOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129'), null);
});

test('رابط فتح إنستاباي', () => {
  const a = instaPayAppLink('android')!;
  assert.match(a, /^intent:\/\/#Intent;package=com\.egyptianbanks\.instapay;/);
  assert.match(a, /S\.browser_fallback_url=https%3A%2F%2Fplay\.google\.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom\.egyptianbanks\.instapay;end$/);
  assert.equal(instaPayAppLink('ios'), INSTAPAY_APPSTORE_URL);
  assert.equal(instaPayAppLink(null), null);
});
