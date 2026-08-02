import assert from 'node:assert/strict';
import test from 'node:test';
import { createDmvSessionOptions } from '../backend/dmv-request.mjs';

test('DMV session uses the configured HTTP proxy', () => {
  assert.deepEqual(
    createDmvSessionOptions({
      DMV_PROXY_REQUIRED: '1',
      DMV_PROXY_URL: 'http://gluetun:8888',
    }),
    {
      browser: 'chrome_142',
      os: 'macos',
      proxy: 'http://gluetun:8888',
    },
  );
});

test('required DMV proxy fails closed when it is absent', () => {
  assert.throws(
    () => createDmvSessionOptions({ DMV_PROXY_REQUIRED: 'true' }),
    /DMV_PROXY_URL is required/,
  );
});

test('DMV proxy rejects non-HTTP transports', () => {
  assert.throws(
    () => createDmvSessionOptions({ DMV_PROXY_URL: 'socks5://gluetun:1080' }),
    /must use the http or https protocol/,
  );
});
