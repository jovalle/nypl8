import { createSession } from 'wreq-js';

const DMV_URL = 'https://transact3.dmv.ny.gov/PlatesPersonalized/';
const DMV_ACTION = new URL('EmpChoosePlate_Action.cfm', DMV_URL).toString();

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase());
}

/** Build the isolated DMV transport settings without silently bypassing a required proxy. */
export function createDmvSessionOptions(environment = process.env) {
  const proxy = environment.DMV_PROXY_URL?.trim();
  if (isEnabled(environment.DMV_PROXY_REQUIRED) && !proxy) {
    throw new Error('DMV_PROXY_URL is required for DMV lookups.');
  }

  if (proxy) {
    const proxyUrl = new URL(proxy);
    if (proxyUrl.protocol !== 'http:' && proxyUrl.protocol !== 'https:') {
      throw new Error('DMV_PROXY_URL must use the http or https protocol.');
    }
  }

  return {
    browser: 'chrome_142',
    os: 'macos',
    ...(proxy ? { proxy } : {}),
  };
}

/** Check one normalized passenger plate using an isolated browser-compatible TLS session. */
export async function checkNyPassengerPlate(plate) {
  const checkedAt = new Date().toISOString();
  const session = await createSession(createDmvSessionOptions());

  try {
    const entry = await session.fetch(DMV_URL, {
      redirect: 'manual',
      timeout: 20_000,
    });
    if (!entry.ok) throw new Error(`NY DMV entry page returned ${entry.status}.`);

    const response = await session.fetch(DMV_ACTION, {
      method: 'POST',
      redirect: 'manual',
      timeout: 20_000,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://transact3.dmv.ny.gov',
        referer: DMV_URL,
      },
      body: new URLSearchParams({
        rbPlateType: 'SRF',
        txtPlateNum: plate,
        btnSubmit: 'Continue',
      }),
    });

    const location = (response.headers.get('location') ?? '').toLowerCase();
    if (location.includes('emppasplatedisplay.cfm')) {
      return {
        plate,
        status: 'available',
        message: 'Available when checked with NY DMV.',
        checkedAt,
      };
    }
    if (location.includes('empplatenotavail.cfm')) {
      return {
        plate,
        status: 'unavailable',
        message: 'Not available according to NY DMV.',
        checkedAt,
      };
    }
    return {
      plate,
      status: 'error',
      message: 'NY DMV returned an unfamiliar response. Try again shortly.',
      checkedAt,
    };
  } finally {
    await session.close();
  }
}
