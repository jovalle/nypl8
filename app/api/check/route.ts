import { createCheckHandler } from '../../../lib/check-handler.ts';
import { recordPlateLookup } from '../../../lib/plate-stats.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const backendUrl = new URL('/api/check', process.env.DMV_BACKEND_URL ?? 'http://127.0.0.1:8080');

export const POST = createCheckHandler({ backendUrl, recordLookup: recordPlateLookup });
