// Pure helpers for the site checker, kept out of SiteChecker.tsx so
// that file only exports the component (fast-refresh rule).

export const PROXY_PREFIX = 'https://proxy.corsfix.com/?'

export type FetchMode = 'api' | 'proxy'
export type ProxyConsent = 'unknown' | 'granted' | 'denied'
export type ApiState = 'checking' | 'ok' | 'missing'

// corsfix takes the raw query string after `?` as the target URL — it
// does not percent-decode it. Verified live 2026-11-14: an encoded
// target (`?https%3A%2F%2Fexample.com%2F`) is rejected with
// `invalid_url`, while the plain form proxies fine, and a target query
// string (`?v=1.2&theme=dark`) arrives at the target intact, so `&`
// is not misparsed as a proxy parameter. Do NOT encodeURIComponent
// the target here; it would break every proxy scan. A `#fragment`
// never reaches any server: the browser strips it from the request,
// and the target server would not see it either.
export const proxyUrl = (target: string) => `${PROXY_PREFIX}${target}`

// A malformed <base href> must not fail the whole scan: fall back to
// the page URL, so the scan continues without stylesheets resolved
// against the broken base.
export const resolveBaseUrl = (doc: Document, pageUrl: string): string => {
  const baseHref = doc.querySelector('base[href]')?.getAttribute('href')?.trim()
  if (!baseHref) return pageUrl
  try {
    return new URL(baseHref, pageUrl).href
  } catch {
    return pageUrl
  }
}

// Which fetch route a scan uses. The API is preferred while it is
// healthy, but a failed API fetch must not lock the user out of the
// proxy fallback: once the API has failed, the proxy is offered until
// the user chooses to try the API again.
export const pickFetchMode = (
  apiState: ApiState,
  apiFailed: boolean,
  proxyConsent: ProxyConsent,
): FetchMode | null =>
  apiState === 'ok' && !apiFailed
    ? 'api'
    : proxyConsent === 'granted'
      ? 'proxy'
      : null

// An error from /api/fetch or /api/css carrying the server's error
// code, so the caller can tell a target problem from an endpoint
// problem (F43). The code is the `error` field of the API's JSON
// body — the same codes server/fetch.mjs and server/handlers.mjs
// return.
export const apiError = (message: string, code?: string): Error => {
  const error = new Error(message)
  if (code) (error as Error & { code?: string }).code = code
  return error
}

export const errorCodeOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code as string | undefined
    : undefined

// Error codes the API returns for a target it correctly refused or
// could not reach. The endpoint worked; the target is the problem —
// so the UI must not mark the API as failed and offer the proxy for
// them. Everything else (a network TypeError, a 404, a non-JSON
// answer, `fetch-failed`, `forbidden-origin`) is the endpoint's own
// failure. Gated on the code, not the HTTP status: /api/fetch maps
// target refusals to 502, so a status list would still trip on a
// target 403.
export const TARGET_ERROR_CODES = new Set([
  'missing-url',
  'invalid-url',
  'url-too-long',
  'blocked-protocol',
  'blocked-credentials',
  'blocked-port',
  'blocked-address',
  'dns-failed',
  'too-large',
  'timeout',
  'network-failed',
  'http-error',
  'blocked-by-site',
  'not-html',
  'not-css',
  'bad-redirect',
  'too-many-redirects',
])

export const isTargetError = (error: unknown): boolean => {
  const code = errorCodeOf(error)
  return code !== undefined && TARGET_ERROR_CODES.has(code)
}
