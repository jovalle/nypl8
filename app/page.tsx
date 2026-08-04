'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { normalizePlate, normalizePlateDraft, validatePlate } from '../lib/plate-validation';

const STORAGE_KEY = 'plate-pantry:v1';
const LEGACY_STORAGE_KEY = 'plate-scout-ny:v1';
const DMV_URL = 'https://transact3.dmv.ny.gov/PlatesPersonalized/';
const MAX_PLATES = 20;
const REMOVE_TRANSITION_MS = 280;
const BASE_PATH =
  process.env.NEXT_PUBLIC_PLATE_PANTRY_BASE_PATH ?? process.env.NEXT_PUBLIC_NYPL8_BASE_PATH ?? '';

function appPath(path: string) {
  return `${BASE_PATH}${path}`;
}

type PlateStatus = 'ready' | 'checking' | 'available' | 'unavailable' | 'error';

type SavedPlate = {
  id: string;
  value: string;
  status: PlateStatus;
  lookupCount: number;
  checkedAt?: string;
  message?: string;
};

type CheckResponse = {
  plate: string;
  status: 'available' | 'unavailable' | 'error';
  message: string;
  checkedAt: string;
  lookupCount?: number;
};

type SavedLookupStatus = Exclude<PlateStatus, 'ready' | 'checking'>;

type PublicPlateStats = {
  value: string;
  lookupCount: number;
  status?: SavedLookupStatus;
  message?: string;
  checkedAt?: string;
};

const SAMPLE_PLATES: SavedPlate[] = [
  {
    id: 'sample-nyk-in-5',
    value: 'NYK IN 5',
    status: 'ready',
    lookupCount: 0,
  },
];

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

async function fetchPublicPlateStats(value: string): Promise<PublicPlateStats | null> {
  try {
    const response = await fetch(appPath(`/api/stats?plate=${encodeURIComponent(value)}`), {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const stats = (await response.json()) as {
      plate?: unknown;
      lookupCount?: unknown;
      status?: unknown;
      message?: unknown;
      checkedAt?: unknown;
    };
    if (stats.plate !== value || !Number.isFinite(stats.lookupCount)) return null;
    return {
      value,
      lookupCount: Math.max(0, Math.trunc(Number(stats.lookupCount))),
      status:
        stats.status === 'available' || stats.status === 'unavailable' || stats.status === 'error'
          ? stats.status
          : undefined,
      message: typeof stats.message === 'string' ? stats.message : undefined,
      checkedAt: typeof stats.checkedAt === 'string' ? stats.checkedAt : undefined,
    };
  } catch {
    return null;
  }
}

function PlateRegistrationPixels({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;
    const target = canvas;
    const drawingContext = context;

    const plateWidth = 660;
    const plateHeight = 343;
    const fontSize = plateWidth * 0.23;
    const slotCount = Math.max(value.length, 1);
    const runWidth = plateWidth * (Math.min(79.2, slotCount * 9.9) / 100);
    const slotWidth = runWidth / slotCount;
    const runStart = (plateWidth - runWidth) / 2;
    // Anchor the visible registration, not the font's engine-specific em box.
    const registrationCenterY = plateHeight * 0.523;
    const stateSymbolCenterY = registrationCenterY;
    const stateSymbol = new window.Image();
    const resizeObserver = new ResizeObserver(draw);
    let disposed = false;
    let fontReady = false;

    function draw() {
      if (disposed || !fontReady) return;

      // Render at an integer multiple of the displayed size so diagonals are
      // supersampled without the uneven rescaling caused by a fixed bitmap.
      const pixelRatio = Math.min((window.devicePixelRatio || 1) * 2, 3);
      const outputWidth = Math.max(1, Math.round(target.clientWidth * pixelRatio));
      const outputHeight = Math.max(1, Math.round((outputWidth * plateHeight) / plateWidth));
      if (target.width !== outputWidth || target.height !== outputHeight) {
        target.width = outputWidth;
        target.height = outputHeight;
      }

      drawingContext.setTransform(1, 0, 0, 1, 0, 0);
      drawingContext.clearRect(0, 0, target.width, target.height);
      drawingContext.scale(target.width / plateWidth, target.height / plateHeight);

      drawingContext.font = `400 ${fontSize}px "License Plate USA", Impact, sans-serif`;
      drawingContext.textAlign = 'center';
      drawingContext.textBaseline = 'alphabetic';

      Array.from(value).forEach((character, index) => {
        const centerX = runStart + slotWidth * (index + 0.5);
        if (character === ' ') return;

        if (character === '@') {
          if (!stateSymbol.complete || !stateSymbol.naturalWidth) return;
          const height = fontSize * 0.45;
          const width = fontSize * 0.515;
          drawingContext.drawImage(
            stateSymbol,
            centerX - width / 2,
            stateSymbolCenterY - height / 2,
            width,
            height,
          );
          return;
        }

        drawingContext.save();
        drawingContext.translate(centerX, registrationCenterY);
        drawingContext.scale(0.79, 1);
        drawingContext.fillStyle = '#07316f';
        drawingContext.shadowColor = '#d2d4d5';
        drawingContext.shadowOffsetX = fontSize * 0.033;
        drawingContext.shadowOffsetY = fontSize * 0.043;
        const metrics = drawingContext.measureText(character);
        const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.5;
        const descent = metrics.actualBoundingBoxDescent || fontSize * 0.1;
        drawingContext.fillText(character, 0, (ascent - descent) / 2);
        drawingContext.restore();
      });
    }

    stateSymbol.addEventListener('load', draw);
    stateSymbol.src = appPath('/ny-state-symbol.png');
    resizeObserver.observe(target);
    void document.fonts.load(`400 ${fontSize}px "License Plate USA"`).then(() => {
      fontReady = true;
      draw();
    });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      stateSymbol.removeEventListener('load', draw);
    };
  }, [value]);

  return (
    <canvas
      ref={canvasRef}
      className="plate-registration-pixels"
      width={660}
      height={343}
      aria-hidden="true"
    />
  );
}

function PlatePreview({ value, priority = false }: { value: string; priority?: boolean }) {
  return (
    <div className="ny-plate" role="img" aria-label={`New York passenger plate ${value}`}>
      <Image
        className="plate-artwork"
        src={appPath('/ny-excelsior-base.png')}
        alt=""
        fill
        priority={priority}
        sizes="(min-width: 620px) 430px, calc(100vw - 66px)"
        aria-hidden="true"
      />
      <PlateRegistrationPixels value={value} />
    </div>
  );
}

function Status({ status }: { status: PlateStatus }) {
  const labels: Record<PlateStatus, string> = {
    ready: 'Not queried',
    checking: 'Checking…',
    available: 'Available',
    unavailable: 'Unavailable',
    error: 'Check failed',
  };
  return (
    <span className={`status status-${status}`}>
      <i />
      {labels[status]}
    </span>
  );
}

export default function Home() {
  const [plates, setPlates] = useState<SavedPlate[]>([]);
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [removingPlateIds, setRemovingPlateIds] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const removeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    function normalize(
      parsed: Array<Partial<SavedPlate> & Pick<SavedPlate, 'id' | 'value' | 'status'>>,
    ): SavedPlate[] {
      return parsed
        .filter((plate) => !plate.id.startsWith('sample-'))
        .map((plate) => ({
          id: plate.id,
          value: plate.value,
          status: plate.status === 'checking' ? ('ready' as const) : plate.status,
          lookupCount: 0,
          message: plate.message,
        }));
    }

    function fromLocalStorage(): SavedPlate[] {
      try {
        const saved =
          window.localStorage.getItem(STORAGE_KEY) ??
          window.localStorage.getItem(LEGACY_STORAGE_KEY);
        return saved ? normalize(JSON.parse(saved)) : [];
      } catch {
        return [];
      }
    }

    const savedPlates = fromLocalStorage();
    const initialPlates = savedPlates.length ? savedPlates : SAMPLE_PLATES;
    setPlates(initialPlates);
    setHydrated(true);
    void refreshPublicStats(initialPlates);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const userPlates = plates
      .filter((plate) => !plate.id.startsWith('sample-'))
      .map(({ id, value, status, message }) => ({ id, value, status, message }));

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(userPlates));
    } catch {
      // Keep the in-memory list usable if browser storage is unavailable.
    }
  }, [plates, hydrated]);

  useEffect(() => {
    if (!removeConfirmId) return;

    function cancelOnPointerAway(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element) {
        const removeButton = target.closest<HTMLButtonElement>('[data-remove-card-id]');
        if (removeButton?.dataset.removeCardId === removeConfirmId) return;
      }
      setRemoveConfirmId(null);
    }

    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setRemoveConfirmId(null);
    }

    document.addEventListener('pointerdown', cancelOnPointerAway, true);
    document.addEventListener('keydown', cancelOnEscape);
    return () => {
      document.removeEventListener('pointerdown', cancelOnPointerAway, true);
      document.removeEventListener('keydown', cancelOnEscape);
    };
  }, [removeConfirmId]);

  useEffect(
    () => () => {
      removeTimersRef.current.forEach((timer) => clearTimeout(timer));
      removeTimersRef.current.clear();
    },
    [],
  );

  async function refreshPublicStats(items: SavedPlate[]) {
    const stats = await Promise.all(items.map((plate) => fetchPublicPlateStats(plate.value)));
    const byValue = new Map(
      stats
        .filter((item): item is PublicPlateStats => Boolean(item))
        .map((item) => [item.value, item]),
    );
    if (!byValue.size) return byValue;

    setPlates((current) =>
      current.map((plate) => {
        const publicStats = byValue.get(plate.value);
        return publicStats
          ? {
              ...plate,
              lookupCount: publicStats.lookupCount,
              status: publicStats.status ?? plate.status,
              message: publicStats.status ? publicStats.message : plate.message,
              checkedAt: publicStats.checkedAt,
            }
          : plate;
      }),
    );
    return byValue;
  }

  async function checkPlate(plate: SavedPlate) {
    setPlates((current) =>
      current.map((item) =>
        item.id === plate.id ? { ...item, status: 'checking', message: undefined } : item,
      ),
    );

    try {
      const response = await fetch(appPath('/api/check'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plate: plate.value }),
        signal: AbortSignal.timeout(45_000),
      });
      const result = (await response.json()) as CheckResponse;
      setPlates((current) =>
        current.map((item) =>
          item.id === plate.id
            ? {
                ...item,
                status: response.ok ? result.status : 'error',
                message: result.message,
                checkedAt: result.checkedAt ?? item.checkedAt,
                lookupCount: result.lookupCount ?? item.lookupCount + 1,
              }
            : item,
        ),
      );
    } catch (error) {
      setPlates((current) =>
        current.map((item) =>
          item.id === plate.id
            ? {
                ...item,
                status: 'error',
                message:
                  error instanceof Error ? error.message : 'The DMV lookup could not be completed.',
              }
            : item,
        ),
      );
    }
  }

  async function loadKnownOrCheckNew(items: SavedPlate[]) {
    const statsByValue = await refreshPublicStats(items);
    const platesWithoutHistory = items.filter((plate) => {
      const stats = statsByValue.get(plate.value);
      return !stats || stats.lookupCount === 0 || !stats.status;
    });

    for (const plate of platesWithoutHistory) await checkPlate(plate);
  }

  function addPlates(raw: string) {
    const candidates = [...new Set(raw.split(',').map(normalizePlate).filter(Boolean))];
    if (!candidates.length) {
      setInputError('Enter a plate number.');
      return;
    }

    const invalid = candidates.find((candidate) => validatePlate(candidate));
    if (invalid) {
      setInputError(`${invalid}: ${validatePlate(invalid)}`);
      return;
    }

    const existingByValue = new Map(plates.map((plate) => [plate.value, plate]));
    const freshValues = candidates.filter((value) => !existingByValue.has(value));
    if (plates.length + freshValues.length > MAX_PLATES) {
      setInputError(`Keep up to ${MAX_PLATES} lookups at a time.`);
      return;
    }

    const newPlates = freshValues.map((value) => ({
      id: crypto.randomUUID(),
      value,
      status: 'ready' as const,
      lookupCount: 0,
    }));
    const existingPlates = candidates
      .map((value) => existingByValue.get(value))
      .filter((plate): plate is SavedPlate => Boolean(plate));

    if (newPlates.length)
      setPlates((current) => [
        ...newPlates,
        ...current.filter((plate) => !plate.id.startsWith('sample-')),
      ]);
    const platesToLoad = [...newPlates, ...existingPlates];
    setDraft('');
    setInputError('');
    void loadKnownOrCheckNew(platesToLoad);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    addPlates(draft);
  }

  function removePlate(plateId: string) {
    setRemoveConfirmId(null);
    setRemovingPlateIds((current) => new Set(current).add(plateId));

    const timer = setTimeout(() => {
      setPlates((current) => current.filter((plate) => plate.id !== plateId));
      setRemovingPlateIds((current) => {
        const next = new Set(current);
        next.delete(plateId);
        return next;
      });
      removeTimersRef.current.delete(plateId);
    }, REMOVE_TRANSITION_MS);

    removeTimersRef.current.set(plateId, timer);
  }

  return (
    <div className="site-shell">
      <main id="top">
        <section className="lookup-intro">
          <h1>Plate Pantry</h1>
          <p>Your pantry of Empire State personalized plate ideas.</p>

          <form onSubmit={handleSubmit} className="plate-form">
            <label className="sr-only" htmlFor="plate-input">
              Plate number
            </label>
            <div className="search-row">
              <input
                ref={inputRef}
                id="plate-input"
                type="search"
                value={draft}
                onChange={(event) => {
                  setDraft(normalizePlateDraft(event.target.value));
                  setInputError('');
                }}
                placeholder="NYK IN 5"
                maxLength={128}
                autoCapitalize="characters"
                autoComplete="off"
                enterKeyHint="search"
                spellCheck={false}
                aria-describedby="plate-error"
                aria-invalid={Boolean(inputError)}
              />
              <button type="submit">Search</button>
            </div>
            {inputError ? (
              <p id="plate-error" className="form-error" role="alert">
                {inputError}
              </p>
            ) : (
              <span id="plate-error" />
            )}
            <p className="storage-note">
              Plate buckets stay in this browser. Lookup counts, query dates, and latest statuses
              are public.
            </p>
          </form>
        </section>

        <section
          className="lookup-list"
          aria-label="Plate lookups"
          aria-live="polite"
          aria-busy={!hydrated || plates.some((plate) => plate.status === 'checking')}
        >
          {!hydrated ? (
            <div className="lookup-hydration-space" role="status">
              <span className="sr-only">Loading saved plate lookups…</span>
            </div>
          ) : null}

          {hydrated
            ? plates.map((plate, index) => (
                <div
                  className={`lookup-card-shell${removingPlateIds.has(plate.id) ? ' is-removing' : ''}`}
                  key={plate.id}
                >
                  <article className={`lookup-card lookup-${plate.status}`}>
                    <div className="card-header">
                      <Status status={plate.status} />
                      <div className="card-actions">
                        <button
                          className="refresh-card"
                          type="button"
                          onClick={() => checkPlate(plate)}
                          disabled={plate.status === 'checking'}
                          aria-label={`Refresh ${plate.value} lookup`}
                          title="Check again"
                        >
                          <span aria-hidden="true">↻</span>
                        </button>
                        <button
                          className={`close-card${removeConfirmId === plate.id ? ' is-confirming' : ''}`}
                          type="button"
                          data-remove-card-id={plate.id}
                          onClick={() => {
                            if (removeConfirmId === plate.id) {
                              removePlate(plate.id);
                            } else {
                              setRemoveConfirmId(plate.id);
                            }
                          }}
                          aria-label={
                            removeConfirmId === plate.id
                              ? `Confirm removal of ${plate.value}`
                              : `Remove ${plate.value} lookup`
                          }
                          aria-describedby={
                            removeConfirmId === plate.id ? `remove-confirm-${plate.id}` : undefined
                          }
                          title={
                            removeConfirmId === plate.id ? 'Click again to remove' : 'Remove lookup'
                          }
                          onBlur={() => {
                            if (removeConfirmId === plate.id) setRemoveConfirmId(null);
                          }}
                        >
                          {removeConfirmId === plate.id ? (
                            <>
                              <span className="confirm-label" aria-hidden="true">
                                Delete?
                              </span>
                              <span className="trash-can" aria-hidden="true">
                                <span className="trash-can-lid" />
                                <span className="trash-can-body" />
                              </span>
                            </>
                          ) : (
                            <span className="close-mark" aria-hidden="true">
                              &times;
                            </span>
                          )}
                        </button>
                        <span
                          className="sr-only"
                          id={`remove-confirm-${plate.id}`}
                          role="status"
                          aria-live="polite"
                        >
                          {removeConfirmId === plate.id
                            ? 'Removal armed. Activate again to confirm, press Escape, or move focus away to cancel.'
                            : ''}
                        </span>
                      </div>
                    </div>

                    <div className="plate-content">
                      <div className="plate-stage">
                        <PlatePreview value={plate.value} priority={index === 0} />
                      </div>

                      <dl className="lookup-stats">
                        <div>
                          <dt>Lookups</dt>
                          <dd>{plate.lookupCount}</dd>
                        </div>
                        <div className="lookup-stat-last-query">
                          <dt>Last queried</dt>
                          <dd>{formatDate(plate.checkedAt)}</dd>
                        </div>
                      </dl>
                    </div>
                  </article>
                </div>
              ))
            : null}

          {!plates.length && hydrated ? (
            <div className="empty-state">
              <p>No lookups yet.</p>
            </div>
          ) : null}
        </section>
      </main>

      <footer>
        <a href={DMV_URL} target="_blank" rel="noreferrer">
          NY DMV Personalized Plates Portal ↗
        </a>
        <p className="maker-credit">
          made by{' '}
          <a
            className="maker-link"
            href="https://github.com/jovalle"
            target="_blank"
            rel="noreferrer"
          >
            <span className="handle-at">@</span>
            <span className="handle-name">jovalle</span>
          </a>{' '}
          with <strong>❤️</strong> and <strong>🇩🇴 ☕️</strong>
        </p>
      </footer>
    </div>
  );
}
