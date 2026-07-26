import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('ships the self-hosted plate dashboard with server-backed persistence', async () => {
  const [page, layout] = await Promise.all([read('app/page.tsx'), read('app/layout.tsx')]);

  assert.match(page, /Grab a NY Plate/);
  assert.match(page, /plate-scout-ny:v1/);
  assert.match(page, /'\/api\/check'/);
  assert.match(page, /'\/api\/plates'/);
  assert.match(page, /AbortSignal\.timeout\(45_000\)/);
  assert.match(page, /const CONCURRENCY = 1/);
  assert.match(page, /aria-invalid/);
  assert.match(page, /aria-busy/);
  assert.match(page, /Plate ideas are saved on this machine\./);

  assert.match(layout, /nypl8/);
  assert.match(layout, /\/ny-state-symbol\.png/);
});

test('runs entirely on the local stack: Next.js proxy plus native DMV lookup', async () => {
  const [checkRoute, platesRoute, dmvRequest, backendPackage, store] = await Promise.all([
    read('app/api/check/route.ts'),
    read('app/api/plates/route.ts'),
    read('backend/dmv-request.mjs'),
    read('backend/package.json'),
    read('lib/plate-store.ts'),
  ]);

  assert.match(checkRoute, /DMV_BACKEND_URL/);
  assert.match(checkRoute, /cache-control/);
  assert.match(platesRoute, /readPlates/);
  assert.match(platesRoute, /writePlates/);
  assert.match(platesRoute, /sanitizePlates/);
  assert.match(store, /NYPL8_DATA_DIR/);
  assert.match(dmvRequest, /createSession/);
  assert.match(dmvRequest, /redirect: "manual"/);
  assert.match(dmvRequest, /session\.close/);
  assert.match(dmvRequest, /txtPlateNum/);
  assert.doesNotMatch(dmvRequest, /playwright|puppeteer|chromium\.launch/);
  assert.match(backendPackage, /"wreq-js": "2\.3\.1"/);
});

test('serves hardened document headers from Next.js', async () => {
  const config = await read('next.config.ts');
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /X-Frame-Options/);
});

test('keeps plate entry accessible and renders supplied artwork', async () => {
  const [page, validation, css] = await Promise.all([
    read('app/page.tsx'),
    read('lib/plate-validation.ts'),
    read('app/globals.css'),
  ]);

  assert.doesNotMatch(validation.match(/normalizePlateDraft[\s\S]*?\n\}/)?.[0] ?? '', /trim\(/);
  assert.match(page, /\/ny-excelsior-source\.png/);
  assert.match(css, /License Plate USA/);
  assert.match(css, /\.plate-registration-mask/);
  assert.match(css, /\.plate-character-run/);
  assert.match(css, /scaleX\(0\.79\)/);
  assert.match(page, /Lookups/);
  assert.match(page, /Queried on/);
  assert.match(page, /Prev\. queried/);
  assert.match(page, /Confirm removal of/);
  assert.match(page, /cancelOnPointerAway/);
  assert.match(page, /cancelOnEscape/);
  assert.match(page, /enterKeyHint="search"/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  await access(new URL('public/ny-excelsior-source.png', root));
  await access(new URL('public/ny-state-symbol.png', root));
  await access(new URL('public/fonts/license-plate-usa.ttf', root));
});
