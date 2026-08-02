import assert from 'node:assert/strict';
import test from 'node:test';
import { createEdgeHandler } from '../edge/worker.ts';

test('relays the Plate Pantry path and preserves its request', async () => {
  let forwarded: Request | undefined;
  const handler = createEdgeHandler(async (request) => {
    forwarded = request;
    return new Response('Plate Pantry', { status: 200, headers: { 'x-origin': 'nexus' } });
  });

  const response = await handler(
    new Request('https://jayro.dev/plate-pantry/api/stats?plate=NYK%20IN%205'),
  );

  assert.equal(
    forwarded?.url,
    'https://nypl8-origin.techn.is/plate-pantry/api/stats?plate=NYK%20IN%205',
  );
  assert.equal(forwarded?.headers.get('x-forwarded-host'), 'jayro.dev');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-origin'), 'nexus');
  assert.equal(response.headers.get('x-plate-pantry-edge-relay'), 'cloudflare-worker');
});

test('redirects legacy links to Plate Pantry with suffixes and queries intact', async () => {
  const handler = createEdgeHandler();
  const response = await handler(new Request('https://jayro.dev/nypl8/api/stats?plate=ABC'));

  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get('location'),
    'https://jayro.dev/plate-pantry/api/stats?plate=ABC',
  );
});

test('does not claim unrelated portfolio paths', async () => {
  const handler = createEdgeHandler();
  const response = await handler(new Request('https://jayro.dev/about'));
  assert.equal(response.status, 404);
});
