import { expect, test } from '@playwright/test';

const BASE_PATH =
  process.env.NEXT_PUBLIC_PLATE_PANTRY_BASE_PATH ?? process.env.NEXT_PUBLIC_NYPL8_BASE_PATH ?? '';
const appPath = (path = '') => `${BASE_PATH}${path}` || '/';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/stats?*', async (route) => {
    const plate = new URL(route.request().url()).searchParams.get('plate') ?? '';
    const isSavedFixture = plate === 'ABC@1234';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plate,
        lookupCount: isSavedFixture ? 7 : 0,
        checkedAt: isSavedFixture ? '2026-08-02T12:00:00.000Z' : undefined,
        previousCheckedAt: isSavedFixture ? '2026-08-01T12:00:00.000Z' : undefined,
      }),
    });
  });
});

test('renders an accessible, responsive plate workspace', async ({ page }) => {
  const plateFontResponse = page.waitForResponse((response) =>
    response.url().endsWith('/fonts/license-plate-usa.ttf'),
  );
  await page.goto(appPath());

  const fontResponse = await plateFontResponse;
  expect(fontResponse.ok()).toBe(true);
  expect(new URL(fontResponse.url()).pathname).toBe(appPath('/fonts/license-plate-usa.ttf'));
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.fonts).some(
          (font) =>
            font.family.replaceAll('"', '') === 'License Plate USA' && font.status === 'loaded',
        ),
      ),
    )
    .toBe(true);

  await expect(page).toHaveTitle(/Plate Pantry/);
  await expect(page.getByRole('heading', { name: 'Plate Pantry' })).toBeVisible();
  const input = page.getByPlaceholder('NYK IN 5');
  await expect(input).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
  await expect(
    page.getByText('Plate buckets stay in this browser. Lookup counts and query dates are public.'),
  ).toBeVisible();

  const registration = page.locator('.plate-registration-pixels').first();
  await expect(registration).toBeVisible();
  await expect
    .poll(() =>
      registration.evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const displayWidth = canvas.getBoundingClientRect().width;
        const pixelRatio = Math.min((window.devicePixelRatio || 1) * 2, 3);
        return (
          canvas.width === Math.round(displayWidth * pixelRatio) &&
          canvas.height === Math.round((canvas.width * 343) / 660)
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      registration.evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const pixels = canvas
          .getContext('2d')
          ?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (!pixels) return false;

        let hasTransparentPixel = false;
        let registrationBlueTop = canvas.height;
        let registrationBlueBottom = -1;
        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          const alpha = pixels[index + 3];
          hasTransparentPixel ||= alpha === 0;
          if (red === 7 && green === 49 && blue === 111 && alpha === 255) {
            const y = Math.floor(index / 4 / canvas.width);
            registrationBlueTop = Math.min(registrationBlueTop, y);
            registrationBlueBottom = Math.max(registrationBlueBottom, y);
          }
        }
        return (
          hasTransparentPixel &&
          registrationBlueTop < canvas.height &&
          registrationBlueBottom > registrationBlueTop
        );
      }),
    )
    .toBe(true);

  await input.fill('a');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#plate-error')).not.toBeEmpty();

  await input.fill('NYK IN 5');
  await expect(input).toHaveAttribute('aria-invalid', 'false');
});

test('serves hardened document responses', async ({ request }) => {
  const response = await request.get(appPath());
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['strict-transport-security']).toContain('max-age=31536000');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');

  const removedPlateStore = await request.get(appPath('/api/plates'));
  expect(removedPlateStore.status()).toBe(404);

  const publicStats = await request.get(appPath('/api/stats?plate=NYK%20IN%205'));
  expect(publicStats.status()).toBe(200);
  expect(await publicStats.json()).toMatchObject({ plate: 'NYK IN 5', lookupCount: 0 });

  const directStatsWrite = await request.post(appPath('/api/stats?plate=NYK%20IN%205'));
  expect(directStatsWrite.status()).toBe(405);
});

test('animates a confirmed card removal before removing it from the page', async ({ page }) => {
  await page.goto(appPath());

  const card = page.locator('.lookup-card-shell').first();
  const remove = page.getByRole('button', { name: 'Remove NYK IN 5 lookup' });

  await remove.click();
  await card.evaluate((element) => {
    document.documentElement.dataset.removalStarted = 'false';
    const observer = new MutationObserver(() => {
      if (element.classList.contains('is-removing')) {
        document.documentElement.dataset.removalStarted = 'true';
        observer.disconnect();
      }
    });
    observer.observe(element, { attributes: true, attributeFilter: ['class'] });
  });

  await page.getByRole('button', { name: 'Confirm removal of NYK IN 5' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-removal-started', 'true');
  await expect(card).toBeHidden({ timeout: 1_000 });
  await expect(page.getByText('No lookups yet.')).toBeVisible();
});

test('loads saved plates without refreshing them against the DMV', async ({ page }) => {
  let apiCalls = 0;
  await page.route('**/api/check', async (route) => {
    apiCalls += 1;
    await route.abort();
  });
  await page.addInitScript((storageKey) => {
    localStorage.setItem(
      storageKey,
      JSON.stringify([
        {
          id: 'saved-plate',
          value: 'ABC@1234',
          status: 'checking',
          lookupCount: 2,
          checkedAt: '2026-07-24T12:00:00.000Z',
        },
      ]),
    );

    const observer = new MutationObserver(() => {
      const root = document.documentElement;
      if (!root) return;
      root.dataset.sampleFlashed ??= 'false';
      if (document.querySelector('[aria-label="New York passenger plate NYK IN 5"]')) {
        root.dataset.sampleFlashed = 'true';
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }, 'plate-pantry:v1');

  await page.goto(appPath());
  await expect(page.getByRole('img', { name: 'New York passenger plate ABC@1234' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-sample-flashed', 'false');
  await expect(page.getByText('Not queried')).toBeVisible();
  await expect(page.locator('.lookup-stats dd').nth(0)).toHaveText('7');
  await expect(page.locator('.lookup-stats dd').nth(1)).toHaveText('08/02/2026');
  await expect(page.locator('.lookup-stats dd').nth(2)).toHaveText('08/01/2026');

  const registration = page.locator('.plate-registration-pixels').first();
  await expect
    .poll(() =>
      registration.evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const pixels = canvas
          .getContext('2d')
          ?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (!pixels) return false;

        const runWidth = canvas.width * 0.792;
        const slotWidth = runWidth / 8;
        const stateSlotCenter = (canvas.width - runWidth) / 2 + slotWidth * 3.5;
        const left = Math.floor(stateSlotCenter - slotWidth / 2);
        const right = Math.ceil(stateSlotCenter + slotWidth / 2);
        let top = canvas.height;
        let bottom = -1;

        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = left; x <= right; x += 1) {
            const index = (y * canvas.width + x) * 4;
            if (
              pixels[index] < 50 &&
              pixels[index + 1] < 80 &&
              pixels[index + 2] < 150 &&
              pixels[index + 3] === 255
            ) {
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
          }
        }

        const center = (top + bottom) / 2;
        return bottom >= 0 && center > canvas.height * 0.47 && center < canvas.height * 0.53;
      }),
    )
    .toBe(true);

  await page.waitForTimeout(250);
  expect(apiCalls).toBe(0);
});

test('shows server-owned aggregate history when a plate is added to the local bucket', async ({
  page,
}) => {
  await page.route('**/api/check', async (route) => {
    expect(JSON.parse(route.request().postData() ?? '{}')).toEqual({ plate: 'ABC 123' });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plate: 'ABC 123',
        status: 'unavailable',
        message: 'Unavailable when checked with NY DMV.',
        lookupCount: 12,
        checkedAt: '2026-08-02T14:00:00.000Z',
        previousCheckedAt: '2026-08-02T12:00:00.000Z',
      }),
    });
  });

  await page.goto(appPath());
  await page.getByPlaceholder('NYK IN 5').fill('abc 123');
  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page.getByRole('img', { name: 'New York passenger plate ABC 123' })).toBeVisible();
  await expect(page.getByText('Unavailable')).toBeVisible();
  await expect(page.locator('.lookup-stats dd').nth(0)).toHaveText('12');
  await expect(page.locator('.lookup-stats dd').nth(1)).toHaveText('08/02/2026');
  await expect(page.locator('.lookup-stats dd').nth(2)).toHaveText('08/02/2026');
  await expect
    .poll(() =>
      page.evaluate(() => {
        return JSON.parse(localStorage.getItem('plate-pantry:v1') ?? '[]');
      }),
    )
    .toEqual([
      {
        id: expect.any(String),
        value: 'ABC 123',
        status: 'unavailable',
        message: 'Unavailable when checked with NY DMV.',
      },
    ]);
});
