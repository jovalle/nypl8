import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createDmvHttpServer } from '../backend/http.mjs';

test('DMV backend HTTP boundary validates requests and streams JSON results', async (context) => {
  const checked = [];
  const server = createDmvHttpServer(async (plate) => {
    checked.push(plate);
    return {
      plate,
      status: 'available',
      message: 'Available when checked with NY DMV.',
      checkedAt: '2026-07-24T00:00:00.000Z',
    };
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');

  const method = await fetch(`${base}/api/check`);
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'POST');

  const invalid = await fetch(`${base}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plate: 'X' }),
  });
  assert.equal(invalid.status, 400);

  const oversized = await fetch(`${base}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'x'.repeat(1_025),
  });
  assert.equal(oversized.status, 413);

  const valid = await fetch(`${base}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plate: 'nyk in 5' }),
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get('cache-control'), 'no-store');
  assert.deepEqual(checked, ['NYK IN 5']);
  assert.equal((await valid.json()).status, 'available');
});
