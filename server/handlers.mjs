// The shared logic behind the fetch, css, and health endpoints
// (F14). The Vercel handlers (api/*.js) and the Netlify functions
// (netlify/functions/*.mjs) used to be near-duplicates of each
// other — same validation, same fetch call, same error mapping —
// differing only in the adapter layer (Vercel req/res vs Netlify
// event return) and in the health response's mode marker
// ('serverless' vs 'netlify', which is intentional per-platform
// labelling). They are thin adapters now; this module is the one
// place the behaviour lives. Each handler takes the method and the
// already-extracted target and returns a plain { status, payload }
// pair, so either platform can render it.
import { FetchError, fetchCss, fetchPage } from './fetch.mjs'
import { createRateLimiter, createResponseCache } from './rateLimit.mjs'

// One limiter and one cache per endpoint, shared by every adapter in
// this process (F71). 30 page fetches a minute per client IP, burst
// included; stylesheets get 60, because one scan fetches one page
// plus up to five sheets and the sheet calls must not eat the page
// budget. Successful fetches are cached for 5 minutes so re-scanning
// the same page does not re-fetch it. Both are in-memory and
// per-instance — a soft limit, not a global quota.
const fetchLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 })
const cssLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 })
const pageCache = createResponseCache({ ttlMs: 300_000, maxEntries: 200 })
const cssCache = createResponseCache({ ttlMs: 300_000, maxEntries: 200 })

const clientIp = (options) =>
  typeof options?.ip === 'string' && options.ip !== '' ? options.ip : 'unknown'

const methodNotAllowed = () => ({
  status: 405,
  payload: { error: 'method-not-allowed', message: 'Use GET.' },
})

const rateLimited = () => ({
  status: 429,
  payload: { error: 'rate-limited', message: 'Too many requests. Try again shortly.' },
})

// Test seam (F71): clear the per-instance limiters and caches so
// tests that mock fetchPage/fetchCss do not leak a cached result from
// one case into the next. Production code never calls this.
export const resetFetchEndpointState = () => {
  fetchLimiter.clear()
  cssLimiter.clear()
  pageCache.clear()
  cssCache.clear()
}

export const handleFetchPage = async (method, target, options = {}) => {
  if (method !== 'GET') return methodNotAllowed()
  if (!target) {
    return {
      status: 400,
      payload: { error: 'missing-url', message: 'Enter a page URL to scan.' },
    }
  }
  if (target.length > 2048) {
    return {
      status: 414,
      payload: { error: 'url-too-long', message: 'That URL is too long.' },
    }
  }
  // Rate limit before the fetch and before the cache (F71): a burst
  // of identical requests must not bypass the limit via the cache.
  // The limit is per client IP and per endpoint.
  const limit = (options.limiter ?? fetchLimiter).check(`fetch:${clientIp(options)}`)
  if (!limit.allowed) return rateLimited()
  const cache = options.cache ?? pageCache
  const cached = cache.get(target)
  if (cached) return cached
  try {
    const page = await fetchPage(target, { allowPrivate: options.allowPrivate ?? false })
    const result = { status: 200, payload: page }
    cache.set(target, result)
    return result
  } catch (error) {
    if (error instanceof FetchError) {
      return {
        status: error.status,
        payload: { error: error.code, message: error.message },
      }
    }
    return {
      status: 502,
      payload: { error: 'fetch-failed', message: 'The page could not be fetched.' },
    }
  }
}

export const handleFetchCss = async (method, target, options = {}) => {
  if (method !== 'GET') return methodNotAllowed()
  if (!target || target.length > 4096) {
    return {
      status: 400,
      payload: { error: 'invalid-request', message: 'A stylesheet URL is required.' },
    }
  }
  // Same per-IP limit as the page endpoint (F71), keyed separately:
  // a scan fetches one page plus several stylesheets, and the sheet
  // calls must not eat the page budget or vice versa. A limited sheet
  // still answers 200 with empty CSS — stylesheets are optional
  // enrichment, and failing the scan over one would punish the user
  // for the limit.
  const limit = (options.limiter ?? cssLimiter).check(`css:${clientIp(options)}`)
  if (!limit.allowed) return { status: 200, payload: { url: target, css: '' } }
  const cache = options.cache ?? cssCache
  const cached = cache.get(target)
  if (cached) return cached
  try {
    const css = await fetchCss(target, { allowPrivate: options.allowPrivate ?? false })
    const result = { status: 200, payload: css }
    cache.set(target, result)
    return result
  } catch (error) {
    if (error instanceof FetchError && error.status === 403) {
      return {
        status: 403,
        payload: { error: error.code, message: error.message },
      }
    }
    // Stylesheets are optional enrichment. Never fail a page scan over one.
    return { status: 200, payload: { url: target, css: '' } }
  }
}

export const handleHealth = (method, mode) => {
  if (method !== 'GET') return methodNotAllowed()
  return { status: 200, payload: { ok: true, mode } }
}
