import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPlateStatsStore } from '../lib/plate-stats.ts';

test('stores public aggregate stats by plate without storing visitor buckets', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'plate-pantry-stats-'));
  context.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });
  const store = createPlateStatsStore(directory);

  assert.deepEqual(await store.get('abc 123'), { plate: 'ABC 123', lookupCount: 0 });

  await Promise.all(
    Array.from({ length: 3 }, (_, index) =>
      store.record('abc 123', {
        status: index === 2 ? 'unavailable' : 'available',
        message: index === 2 ? 'Not available according to NY DMV.' : 'Available.',
        checkedAt: `2026-08-02T12:00:0${index}.000Z`,
      }),
    ),
  );

  assert.deepEqual(await store.get('ABC 123'), {
    plate: 'ABC 123',
    lookupCount: 3,
    status: 'unavailable',
    message: 'Not available according to NY DMV.',
    checkedAt: '2026-08-02T12:00:02.000Z',
  });

  const persisted = JSON.parse(await readFile(join(directory, 'plate-stats.json'), 'utf8'));
  assert.deepEqual(Object.keys(persisted), ['ABC 123']);
  assert.equal('id' in persisted['ABC 123'], false);
  assert.equal(persisted['ABC 123'].status, 'unavailable');
  assert.equal(persisted['ABC 123'].message, 'Not available according to NY DMV.');
});
