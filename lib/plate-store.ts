import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** A saved plate row persisted on the local machine. */
export type StoredPlate = {
  id: string;
  value: string;
  status: string;
  lookupCount: number;
  checkedAt?: string;
  previousCheckedAt?: string;
  message?: string;
};

const MAX_PLATES = 200;
const dataDir = resolve(process.env.NYPL8_DATA_DIR ?? 'data');
const storeFile = join(dataDir, 'plates.json');

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

/** Coerce untrusted input into a bounded, well-formed plate list. */
export function sanitizePlates(input: unknown): StoredPlate[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const plates: StoredPlate[] = [];

  for (const entry of input) {
    const record = asRecord(entry);
    if (!record) continue;
    const id = asString(record.id, 64);
    const value = asString(record.value, 8);
    if (!id || !value || seen.has(id)) continue;
    seen.add(id);

    const rawCount = Number(record.lookupCount);
    plates.push({
      id,
      value,
      status: asString(record.status, 16) ?? 'ready',
      lookupCount: Number.isFinite(rawCount)
        ? Math.max(0, Math.min(1_000_000, Math.trunc(rawCount)))
        : 0,
      checkedAt: asString(record.checkedAt, 40),
      previousCheckedAt: asString(record.previousCheckedAt, 40),
      message: asString(record.message, 200),
    });
    if (plates.length >= MAX_PLATES) break;
  }

  return plates;
}

/** Read the saved plate list, returning an empty list when nothing is stored yet. */
export async function readPlates(): Promise<StoredPlate[]> {
  try {
    return sanitizePlates(JSON.parse(await readFile(storeFile, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Atomically persist the plate list to local disk. */
export async function writePlates(plates: StoredPlate[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const temp = join(dataDir, `.plates.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temp, JSON.stringify(plates, null, 2), 'utf8');
  await rename(temp, storeFile);
}
