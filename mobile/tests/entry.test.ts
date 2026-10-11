import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientPayload, emptyEntry, leadPayload, maxPhotoBytes, sameContact, sanitizePhotoName, validateEntry, validatePhoto } from '../lib/entry-model.ts';

test('dedupe matches formatted phone numbers and case-insensitive trimmed email without substring collisions', () => {
  assert.equal(sameContact({ email: null, phone: '(416) 555-0100' }, { email: '', phone: '4165550100' }), true);
  assert.equal(sameContact({ email: ' CLIENT@EXAMPLE.TEST ', phone: null }, { email: 'client@example.test', phone: '' }), true);
  assert.equal(sameContact({ email: null, phone: '14165550100123' }, { email: '', phone: '4165550100' }), false);
  assert.equal(sameContact({ email: null, phone: null }, { email: '', phone: '' }), false);
});
test('entry requires name/title and rejects malformed optional contact fields', () => {
  assert.deepEqual(Object.keys(validateEntry(emptyEntry)).sort(), ['name', 'request']);
  assert.deepEqual(validateEntry({ ...emptyEntry, name: 'Client', request: 'Rekey lock' }), {});
  assert.ok(validateEntry({ ...emptyEntry, email: 'bad', phone: '123' }).email);
  assert.ok(validateEntry({ ...emptyEntry, email: 'bad', phone: '123' }).phone);
});
test('lead payload prepends access instructions, starts as lead, and omits assignment/GPS/pricing fields', () => {
  const draft = { ...emptyEntry, name: ' Client ', request: ' Rekey lock ', email: 'CLIENT@EXAMPLE.TEST ', unit: ' 4B ', gate: ' 1234 ', details: ' Bring two keys. ' };
  assert.deepEqual(leadPayload(draft, 'org', 'client'), { organization_id: 'org', client_id: 'client', request: 'Rekey lock', details: 'Unit 4B, Gate 1234\n\nBring two keys.', status: 'lead', service: 'locksmith' });
  assert.equal(clientPayload(draft, 'org').email, 'client@example.test');
  assert.equal(clientPayload({ ...draft, relationship: 'owner' }, 'org').relationship, 'other');
  assert.equal(leadPayload({ ...draft, service: 'security_film' }, 'org', 'client').service, 'security_film');
  assert.equal(leadPayload({ ...emptyEntry, request: 'Job' }, 'org', 'client').details, null);
});
test('photo boundaries reject oversized/non-image/empty uploads and sanitize traversal characters', () => {
  assert.equal(validatePhoto(maxPhotoBytes, 'image/jpeg'), null);
  assert.ok(validatePhoto(maxPhotoBytes + 1, 'image/jpeg'));
  assert.ok(validatePhoto(10, 'application/pdf'));
  assert.ok(validatePhoto(0, 'image/png'));
  assert.equal(sanitizePhotoName('../Front Door.JPG'), '..-front-door.jpg');
  assert.equal(sanitizePhotoName(''), 'photo.jpg');
});
