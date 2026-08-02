import { NextResponse } from 'next/server.js';
import { getPlateStats, PLATE_STATS_HEADERS } from '../../../lib/plate-stats.ts';
import { normalizePlate, validatePlate } from '../../../lib/plate-validation.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const plate = normalizePlate(new URL(request.url).searchParams.get('plate') ?? '');
  const validationError = validatePlate(plate);
  if (validationError) {
    return NextResponse.json(
      { error: validationError },
      { status: 400, headers: PLATE_STATS_HEADERS },
    );
  }

  try {
    return NextResponse.json(await getPlateStats(plate), { headers: PLATE_STATS_HEADERS });
  } catch {
    return NextResponse.json(
      { error: 'Could not load public plate statistics.' },
      { status: 500, headers: PLATE_STATS_HEADERS },
    );
  }
}
