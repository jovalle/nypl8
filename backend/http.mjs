import { createServer } from 'node:http';

const MAX_BODY_BYTES = 1_024;
const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
};

function normalizePlate(value) {
  return typeof value === 'string'
    ? value
        .toUpperCase()
        .replace(/[^A-Z0-9 @]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

function validatePlate(value) {
  if (value.length < 2 || value.length > 8) return 'Passenger plates must use 2 to 8 characters.';
  if (value.startsWith('@') || value.endsWith('@')) {
    return 'The state symbol cannot be first or last.';
  }
  if ((value.match(/@/g) ?? []).length > 1) return 'The state symbol can only be used once.';
  return null;
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, { ...JSON_HEADERS, ...headers });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    const error = new Error('Request body is too large.');
    error.status = 413;
    throw error;
  }

  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createDmvHttpServer(checkPlate) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://container.internal');
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      });
      response.end('ok');
      return;
    }
    if (url.pathname !== '/api/check') {
      sendJson(response, 404, { error: 'Not found.' });
      return;
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' }, { allow: 'POST' });
      return;
    }
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      sendJson(response, 415, { error: 'Content-Type must be application/json.' });
      return;
    }

    try {
      const body = await readJson(request);
      const plate = normalizePlate(body?.plate);
      const validationError = validatePlate(plate);
      if (validationError) {
        sendJson(response, 400, {
          plate,
          status: 'error',
          message: validationError,
          checkedAt: new Date().toISOString(),
        });
        return;
      }

      const result = await checkPlate(plate);
      sendJson(response, result.status === 'error' ? 502 : 200, result);
    } catch (error) {
      request.resume();
      const status = Number.isInteger(error?.status) ? error.status : 502;
      sendJson(response, status, {
        plate: '',
        status: 'error',
        message:
          status === 413
            ? 'Request body is too large.'
            : 'The NY DMV lookup could not be completed. Try again in a moment.',
        checkedAt: new Date().toISOString(),
      });
    }
  });

  server.headersTimeout = 5_000;
  server.requestTimeout = 45_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 32;
  server.maxRequestsPerSocket = 100;
  return server;
}
