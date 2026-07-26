import { expect, test } from '@playwright/test';

// Keep browser tests deterministic and independent of the on-disk plate store.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/plates', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
  });
});

test('renders an accessible, responsive plate workspace', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/nypl8/);
  await expect(page.getByRole('heading', { name: 'Grab a NY Plate' })).toBeVisible();
  const input = page.getByPlaceholder('NYK IN 5');
  await expect(input).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
  await expect(page.getByText('Plate ideas are saved on this machine.')).toBeVisible();

  await input.fill('a');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#plate-error')).not.toBeEmpty();

  await input.fill('NYK IN 5');
  await expect(input).toHaveAttribute('aria-invalid', 'false');
});

test('serves hardened document responses', async ({ request }) => {
  const response = await request.get('/');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['strict-transport-security']).toContain('max-age=31536000');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
});

test('animates a confirmed card removal before removing it from the page', async ({ page }) => {
  await page.goto('/');

  const card = page.locator('.lookup-card-shell').first();
  const remove = page.getByRole('button', { name: 'Remove NYPL8 lookup' });

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

  await page.getByRole('button', { name: 'Confirm removal of NYPL8' }).click();

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
          value: 'ABC1234',
          status: 'checking',
          lookupCount: 2,
          checkedAt: '2026-07-24T12:00:00.000Z',
        },
      ]),
    );
  }, 'plate-scout-ny:v1');

  await page.goto('/');
  await expect(page.getByRole('img', { name: 'New York passenger plate ABC1234' })).toBeVisible();
  await expect(page.getByText('Not queried')).toBeVisible();
  await page.waitForTimeout(250);
  expect(apiCalls).toBe(0);
});
