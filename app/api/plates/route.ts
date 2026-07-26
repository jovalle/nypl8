import { NextResponse } from 'next/server';
import { readPlates, sanitizePlates, writePlates } from '../../../lib/plate-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;
const MAX_BODY_BYTES = 64_000;

/** Return the plate list saved on this machine. */
export async function GET() {
  try {
    return NextResponse.json(await readPlates(), { headers: NO_STORE });
  } catch {
    return NextResponse.json([], { headers: NO_STORE });
  }
}

/** Replace the saved plate list with a sanitized copy of the request body. */
export async function PUT(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Request body is too large.' },
      { status: 413, headers: NO_STORE },
    );
  }

  try {
    const plates = sanitizePlates(await request.json());
    await writePlates(plates);
    return NextResponse.json({ ok: true, count: plates.length }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: 'Could not save plates.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
