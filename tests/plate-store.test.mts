import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePlates } from '../lib/plate-store.ts';

test('keeps well-formed plate rows and normalizes their fields', () => {
  const [plate] = sanitizePlates([
    {
      id: 'abc',
      value: 'NYPL8',
      status: 'available',
      lookupCount: 3,
      checkedAt: '2026-07-24T00:00:00.000Z',
    },
  ]);

  assert.equal(plate.id, 'abc');
  assert.equal(plate.value, 'NYPL8');
  assert.equal(plate.status, 'available');
  assert.equal(plate.lookupCount, 3);
});

test('rejects malformed input and untrusted shapes', () => {
  assert.deepEqual(sanitizePlates(null), []);
  assert.deepEqual(sanitizePlates('nope'), []);
  assert.deepEqual(sanitizePlates([{ id: 'x' }]), []); // missing value
  assert.deepEqual(sanitizePlates([{ value: 'AB' }]), []); // missing id
});

test('bounds field sizes, drops duplicate ids, and caps list length', () => {
  const dupes = sanitizePlates([
    { id: 'same', value: 'AAA' },
    { id: 'same', value: 'BBB' },
  ]);
  assert.equal(dupes.length, 1);

  const [clamped] = sanitizePlates([
    { id: 'a', value: 'TOO LONG PLATE', status: 'x'.repeat(50), lookupCount: -5 },
  ]);
  assert.equal(clamped.value.length, 8);
  assert.equal(clamped.lookupCount, 0);
  assert.ok(clamped.status.length <= 16);

  const many = Array.from({ length: 500 }, (_, index) => ({ id: `id-${index}`, value: 'AB' }));
  assert.ok(sanitizePlates(many).length <= 200);
});
