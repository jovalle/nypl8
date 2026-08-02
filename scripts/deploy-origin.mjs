const apiUrl = process.env.COOLIFY_API_URL ?? 'https://apps.techn.is';
const applicationUuid = process.env.COOLIFY_APPLICATION_UUID ?? 'qusmquyldrrqdpzy19xre2oe';
const token = process.env.COOLIFY_DEPLOY_TOKEN;
const accessClientId = process.env.COOLIFY_ACCESS_CLIENT_ID;
const accessClientSecret = process.env.COOLIFY_ACCESS_CLIENT_SECRET;

if (!token) throw new Error('COOLIFY_DEPLOY_TOKEN is required.');
if (!accessClientId || !accessClientSecret) {
  throw new Error('COOLIFY_ACCESS_CLIENT_ID and COOLIFY_ACCESS_CLIENT_SECRET are required.');
}

const headers = {
  authorization: `Bearer ${token}`,
  accept: 'application/json',
  'content-type': 'application/json',
  'cf-access-client-id': accessClientId,
  'cf-access-client-secret': accessClientSecret,
};

const deploymentResponse = await fetch(`${apiUrl}/api/v1/deploy`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ uuid: applicationUuid, force: false }),
});

if (!deploymentResponse.ok) {
  const responseText = (await deploymentResponse.text()).replace(/\s+/g, ' ').slice(0, 500);
  const responseSource = deploymentResponse.headers.get('cf-mitigated')
    ? 'Cloudflare Access'
    : (deploymentResponse.headers.get('content-type') ?? 'unknown source');
  throw new Error(
    `Coolify rejected the deployment (${deploymentResponse.status}, ${responseSource}): ${responseText}`,
  );
}

const deploymentPayload = await deploymentResponse.json();
const deploymentUuid =
  deploymentPayload?.deployments?.[0]?.deployment_uuid ?? deploymentPayload?.deployment_uuid;

if (typeof deploymentUuid !== 'string' || !deploymentUuid) {
  throw new Error('Coolify did not return a deployment identifier.');
}

console.log(`Origin deployment queued: ${deploymentUuid}`);

const deadline = Date.now() + 15 * 60_000;
let lastStatus = '';

while (Date.now() < deadline) {
  const statusResponse = await fetch(`${apiUrl}/api/v1/deployments/${deploymentUuid}`, {
    headers,
  });
  if (!statusResponse.ok) {
    throw new Error(`Could not read Coolify deployment status (${statusResponse.status}).`);
  }

  const statusPayload = await statusResponse.json();
  const status = String(statusPayload?.status ?? '').toLowerCase();
  if (status && status !== lastStatus) {
    console.log(`Origin deployment status: ${status}`);
    lastStatus = status;
  }

  if (['finished', 'completed', 'success', 'succeeded'].includes(status)) process.exit(0);
  if (['failed', 'cancelled', 'canceled', 'error'].includes(status)) {
    throw new Error(`Coolify deployment ended with status: ${status}.`);
  }

  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

throw new Error('Coolify deployment did not finish within 15 minutes.');
