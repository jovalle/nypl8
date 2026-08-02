import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCheckHandler } from '../lib/check-handler.ts';
import { createPlateStatsStore } from '../lib/plate-stats.ts';

test('records successful API checks as public aggregate stats', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'plate-pantry-check-route-'));
  const timestamps = ['2026-08-02T12:00:00.000Z', '2026-08-02T13:00:00.000Z'];
  let requestCount = 0;
  const store = createPlateStatsStore(directory);

  const fetchBackend: typeof fetch = async () =>
    Response.json({
      plate: 'ABC 123',
      status: 'available',
      message: 'Available when checked with NY DMV.',
      checkedAt: timestamps[requestCount++],
    });
  context.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const POST = createCheckHandler({
    backendUrl: new URL('http://backend.test/api/check'),
    fetchBackend,
    recordLookup: store.record,
  });
  const request = () =>
    new Request('http://localhost/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plate: 'abc 123' }),
    });

  const first = await POST(request());
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    plate: 'ABC 123',
    status: 'available',
    message: 'Available when checked with NY DMV.',
    checkedAt: timestamps[0],
    lookupCount: 1,
  });

  const second = await POST(request());
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), {
    plate: 'ABC 123',
    status: 'available',
    message: 'Available when checked with NY DMV.',
    checkedAt: timestamps[1],
    lookupCount: 2,
    previousCheckedAt: timestamps[0],
  });

  const persisted = JSON.parse(await readFile(join(directory, 'plate-stats.json'), 'utf8'));
  assert.equal(persisted['ABC 123'].lookupCount, 2);
});
