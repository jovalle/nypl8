const ORIGIN = 'https://nypl8-origin.techn.is';
const CURRENT_PATH = '/plate-pantry';
const LEGACY_PATH = '/nypl8';

export type OriginFetch = (request: Request) => Promise<Response>;

function isPath(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function createEdgeHandler(originFetch: OriginFetch = fetch) {
  return async function handle(request: Request): Promise<Response> {
    const incomingUrl = new URL(request.url);

    if (isPath(incomingUrl.pathname, LEGACY_PATH)) {
      const suffix = incomingUrl.pathname.slice(LEGACY_PATH.length);
      incomingUrl.pathname = `${CURRENT_PATH}${suffix}`;
      return Response.redirect(incomingUrl, 308);
    }

    if (!isPath(incomingUrl.pathname, CURRENT_PATH)) {
      return new Response('Not found', { status: 404 });
    }

    const originUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, ORIGIN);
    const forwardedRequest = new Request(originUrl, request);
    forwardedRequest.headers.set('x-forwarded-host', incomingUrl.host);
    forwardedRequest.headers.set('x-forwarded-proto', incomingUrl.protocol.slice(0, -1));

    const originResponse = await originFetch(forwardedRequest);
    const response = new Response(originResponse.body, originResponse);
    response.headers.set('x-plate-pantry-edge-relay', 'cloudflare-worker');
    return response;
  };
}

const handle = createEdgeHandler();

const worker = {
  fetch(request: Request) {
    return handle(request);
  },
};

export default worker;
