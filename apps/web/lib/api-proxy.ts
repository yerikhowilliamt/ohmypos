import { resolveBackendApiBaseUrl } from './api-url';

const REQUEST_HEADERS_TO_FORWARD = [
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'cookie',
  'if-modified-since',
  'if-none-match',
  'range',
  'user-agent',
  'x-correlation-id',
  'x-forwarded-for',
] as const;

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type StreamingRequestInit = RequestInit & { duplex?: 'half' };

export interface ApiProxyDependencies {
  backendApiBaseUrl?: string;
  fetch?: typeof fetch;
}

function isTrustedBrowserOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

  const origin = request.headers.get('origin');
  return origin === null || origin === new URL(request.url).origin;
}

function buildTargetUrl(request: Request, path: string[], baseUrl: string) {
  const encodedPath = path
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const target = new URL(`${baseUrl}/${encodedPath}`);
  target.search = new URL(request.url).search;
  return target;
}

function buildUpstreamHeaders(request: Request): Headers {
  const headers = new Headers();

  for (const name of REQUEST_HEADERS_TO_FORWARD) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  return headers;
}

function buildClientHeaders(upstream: Response): Headers {
  const headers = new Headers();

  upstream.headers.forEach((value, name) => {
    if (
      name !== 'set-cookie' &&
      !HOP_BY_HOP_RESPONSE_HEADERS.has(name.toLowerCase())
    ) {
      headers.append(name, value);
    }
  });

  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append('set-cookie', cookie);
  }

  return headers;
}

/**
 * Same-origin BFF transport for the browser-facing `/api/v1/**` route.
 * Request and response bodies stay as streams so multipart boundaries and
 * backend error payloads pass through unchanged.
 */
export async function proxyApiRequest(
  request: Request,
  path: string[],
  dependencies: ApiProxyDependencies = {},
): Promise<Response> {
  if (!isTrustedBrowserOrigin(request)) {
    return Response.json(
      { message: 'Cross-origin API requests are not allowed' },
      { status: 403 },
    );
  }

  const fetchUpstream = dependencies.fetch ?? fetch;
  const backendApiBaseUrl =
    dependencies.backendApiBaseUrl ?? resolveBackendApiBaseUrl();
  const target = buildTargetUrl(request, path, backendApiBaseUrl);
  const init: StreamingRequestInit = {
    method: request.method,
    headers: buildUpstreamHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  };

  if (!METHODS_WITHOUT_BODY.has(request.method.toUpperCase())) {
    init.body = request.body;
    init.duplex = 'half';
  }

  try {
    const upstream = await fetchUpstream(target, init);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: buildClientHeaders(upstream),
    });
  } catch {
    const headers = new Headers({ 'content-type': 'application/json' });
    const correlationId = request.headers.get('x-correlation-id');
    if (correlationId) headers.set('x-correlation-id', correlationId);

    return new Response(
      JSON.stringify({ message: 'Backend API is temporarily unavailable' }),
      { status: 502, headers },
    );
  }
}
