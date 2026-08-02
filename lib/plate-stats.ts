import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { normalizePlate, validatePlate } from './plate-validation.ts';

export type PublicPlateStats = {
  plate: string;
  lookupCount: number;
  checkedAt?: string;
  previousCheckedAt?: string;
};

type StatsFile = Record<string, Omit<PublicPlateStats, 'plate'>>;

const EMPTY_HEADERS = { 'cache-control': 'no-store' } as const;
export { EMPTY_HEADERS as PLATE_STATS_HEADERS };

function cleanTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 40 || Number.isNaN(Date.parse(value))) {
    return undefined;
  }
  return value;
}

function sanitizeStatsFile(input: unknown): StatsFile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const result: StatsFile = {};
  for (const [rawPlate, rawStats] of Object.entries(input)) {
    const plate = normalizePlate(rawPlate);
    if (validatePlate(plate) || !rawStats || typeof rawStats !== 'object') continue;

    const stats = rawStats as Record<string, unknown>;
    const count = Number(stats.lookupCount);
    result[plate] = {
      lookupCount: Number.isFinite(count)
        ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(count)))
        : 0,
      checkedAt: cleanTimestamp(stats.checkedAt),
      previousCheckedAt: cleanTimestamp(stats.previousCheckedAt),
    };
  }
  return result;
}

export function createPlateStatsStore(
  directory = process.env.PLATE_PANTRY_STATS_DIR ?? process.env.NYPL8_DATA_DIR,
) {
  const dataDir = directory ? resolve(directory) : join(process.cwd(), 'data');
  const statsFile = join(dataDir, 'plate-stats.json');
  let writeQueue: Promise<unknown> = Promise.resolve();

  async function readAll(): Promise<StatsFile> {
    try {
      return sanitizeStatsFile(JSON.parse(await readFile(statsFile, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  async function writeAll(stats: StatsFile): Promise<void> {
    await mkdir(dataDir, { recursive: true });
    const tempFile = join(dataDir, `.plate-stats.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tempFile, JSON.stringify(stats, null, 2), 'utf8');
    await rename(tempFile, statsFile);
  }

  async function get(plateInput: string): Promise<PublicPlateStats> {
    const plate = normalizePlate(plateInput);
    if (validatePlate(plate)) throw new Error('Invalid plate.');
    const current = (await readAll())[plate];
    return current ? { plate, ...current } : { plate, lookupCount: 0 };
  }

  function record(plateInput: string, checkedAtInput: string): Promise<PublicPlateStats> {
    const plate = normalizePlate(plateInput);
    const checkedAt = cleanTimestamp(checkedAtInput);
    if (validatePlate(plate) || !checkedAt) return Promise.reject(new Error('Invalid lookup.'));

    const operation = writeQueue.then(async () => {
      const allStats = await readAll();
      const current = allStats[plate];
      const updated: Omit<PublicPlateStats, 'plate'> = {
        lookupCount: (current?.lookupCount ?? 0) + 1,
        checkedAt,
        previousCheckedAt: current?.checkedAt,
      };
      allStats[plate] = updated;
      await writeAll(allStats);
      return { plate, ...updated };
    });

    writeQueue = operation.catch(() => undefined);
    return operation;
  }

  return { get, record };
}

let defaultStore: ReturnType<typeof createPlateStatsStore> | undefined;

function getDefaultStore() {
  defaultStore ??= createPlateStatsStore();
  return defaultStore;
}

export const getPlateStats = (plate: string) => getDefaultStore().get(plate);
export const recordPlateLookup = (plate: string, checkedAt: string) =>
  getDefaultStore().record(plate, checkedAt);
