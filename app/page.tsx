'use client';

import Image from 'next/image';
import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { normalizePlate, normalizePlateDraft, validatePlate } from '../lib/plate-validation';

const STORAGE_KEY = 'plate-scout-ny:v1';
const DMV_URL = 'https://transact3.dmv.ny.gov/PlatesPersonalized/';
const MAX_PLATES = 20;
const CONCURRENCY = 1;
const REMOVE_TRANSITION_MS = 280;

type PlateStatus = 'ready' | 'checking' | 'available' | 'unavailable' | 'error';

type SavedPlate = {
  id: string;
  value: string;
  status: PlateStatus;
  lookupCount: number;
  checkedAt?: string;
  previousCheckedAt?: string;
  message?: string;
};

type CheckResponse = {
  plate: string;
  status: 'available' | 'unavailable' | 'error';
  message: string;
  checkedAt: string;
};

const SAMPLE_PLATES: SavedPlate[] = [
  {
    id: 'sample-nypl8',
    value: 'NYPL8',
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

function PlatePreview({ value, priority = false }: { value: string; priority?: boolean }) {
  const slotCount = Math.max(value.length, 1);
  const runWidth = Math.min(79.2, slotCount * 9.9);

  return (
    <div className="ny-plate" role="img" aria-label={`New York passenger plate ${value}`}>
      <Image
        className="plate-artwork"
        src="/ny-excelsior-source.png"
        alt=""
        fill
        priority={priority}
        sizes="(min-width: 620px) 430px, calc(100vw - 66px)"
        aria-hidden="true"
      />
      <span className="plate-registration-mask" aria-hidden="true" />
      <div className="plate-characters" aria-hidden="true">
        <div
          className="plate-character-run"
          style={
            {
              '--plate-slot-count': slotCount,
              '--plate-run-width': `${runWidth}%`,
            } as CSSProperties
          }
        >
          {Array.from(value).map((character, index) => {
            if (character === ' ')
              return (
                <span className="plate-space" key={index}>
                  &nbsp;
                </span>
              );
            if (character === '@') return <span className="ny-state" key={index} />;
            return (
              <span className="plate-glyph" key={index}>
                {character}
              </span>
            );
          })}
        </div>
      </div>
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
  const [plates, setPlates] = useState<SavedPlate[]>(SAMPLE_PLATES);
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [removingPlateIds, setRemovingPlateIds] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const removeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let cancelled = false;

    function normalize(
      parsed: Array<Partial<SavedPlate> & Pick<SavedPlate, 'id' | 'value' | 'status'>>,
    ): SavedPlate[] {
      return parsed
        .filter((plate) => !plate.id.startsWith('sample-'))
        .map((plate) => ({
          ...plate,
          status: plate.status === 'checking' ? ('ready' as const) : plate.status,
          lookupCount: plate.lookupCount ?? (plate.checkedAt ? 1 : 0),
        }));
    }

    function fromLocalStorage(): SavedPlate[] {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        return saved ? normalize(JSON.parse(saved)) : [];
      } catch {
        return [];
      }
    }

    async function load() {
      let userPlates: SavedPlate[] = [];
      try {
        const response = await fetch('/api/plates', { cache: 'no-store' });
        if (response.ok) {
          const serverPlates = normalize(await response.json());
          // Server is authoritative once it holds data; otherwise adopt any
          // existing browser copy (first-run migration or offline use).
          userPlates = serverPlates.length ? serverPlates : fromLocalStorage();
        } else {
          userPlates = fromLocalStorage();
        }
      } catch {
        userPlates = fromLocalStorage();
      }
      if (cancelled) return;
      setPlates(userPlates.length ? userPlates : SAMPLE_PLATES);
      setHydrated(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const userPlates = plates.filter((plate) => !plate.id.startsWith('sample-'));

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(userPlates));
    } catch {
      // Ignore storage failures (e.g. private mode); the server copy is authoritative.
    }

    const timer = setTimeout(() => {
      void fetch('/api/plates', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(userPlates),
        keepalive: true,
      }).catch(() => {
        // Offline or server unavailable; the browser copy still holds the latest state.
      });
    }, 400);

    return () => clearTimeout(timer);
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

  async function checkPlate(plate: SavedPlate) {
    setPlates((current) =>
      current.map((item) =>
        item.id === plate.id ? { ...item, status: 'checking', message: undefined } : item,
      ),
    );

    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plate: plate.value }),
        signal: AbortSignal.timeout(45_000),
      });
      const result = (await response.json()) as CheckResponse;
      if (!response.ok) throw new Error(result.message || 'The lookup could not be completed.');
      setPlates((current) =>
        current.map((item) =>
          item.id === plate.id
            ? {
                ...item,
                status: result.status,
                message: result.message,
                previousCheckedAt: item.checkedAt,
                checkedAt: result.checkedAt,
                lookupCount: item.lookupCount + 1,
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
                previousCheckedAt: item.checkedAt,
                checkedAt: new Date().toISOString(),
                lookupCount: item.lookupCount + 1,
              }
            : item,
        ),
      );
    }
  }

  async function checkMany(items: SavedPlate[]) {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const next = queue.shift();
        if (next) await checkPlate(next);
      }
    });
    await Promise.all(workers);
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
    setDraft('');
    setInputError('');
    void checkMany([...newPlates, ...existingPlates]);
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
          <h1>Grab a NY Plate</h1>
          <p>Personalized plates in NY.</p>

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
          </form>
        </section>

        <section
          className="lookup-list"
          aria-label="Plate lookups"
          aria-live="polite"
          aria-busy={plates.some((plate) => plate.status === 'checking')}
        >
          {plates.map((plate, index) => (
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
                    <div>
                      <dt>Queried on</dt>
                      <dd>{formatDate(plate.checkedAt)}</dd>
                    </div>
                    <div>
                      <dt>Prev. queried</dt>
                      <dd>{formatDate(plate.previousCheckedAt)}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            </div>
          ))}

          {!plates.length && hydrated ? (
            <div className="empty-state">
              <p>No lookups yet.</p>
            </div>
          ) : null}
        </section>
      </main>

      <footer>
        <a href={DMV_URL} target="_blank" rel="noreferrer">
          NY DMV personalized plates ↗
        </a>
        <p>Availability can change and remains subject to DMV review.</p>
        <p>Plate ideas are saved on this machine. Availability comes straight from the NY DMV.</p>
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
