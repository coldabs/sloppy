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
