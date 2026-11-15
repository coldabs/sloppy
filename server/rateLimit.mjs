// Per-IP rate limiting and short response caching for the public
// fetch endpoints (F71). /api/fetch is a free proxy to arbitrary
// URLs, so without a limit one client can make the server fetch
// indefinitely; without a cache, re-scanning the same page re-fetches
// it every time.
//
// Both are deliberately soft and in-memory: each serverless instance
// (or the local dev server) keeps its own buckets and cache, so the
// limit is per instance, not global. That is enough to blunt abuse
// and repeated scans; it is not a billing-grade quota.
//
// The limiter is a token bucket: `limit` requests burst, refilling
// at limit/windowMs. The cache stores only successful (200) fetches,
// keyed on the requested URL as typed, for `ttlMs`.
//
// Safety note: the cache is consulted only after the cheap
// validation and the rate-limit check, and only successful fetches
// are stored — entries come from targets the SSRF guard already
// validated. Serving a cached entry makes no new outbound request,
// so a target whose DNS answer changed after it was cached cannot
// turn a cache hit into a fetch of a private address.

// First entry of X-Forwarded-For, else the platform's direct client
// IP header. Returns undefined when nothing is present (the caller
// then buckets as 'unknown').
export const clientIpFromHeaders = (headers = {}) => {
  const forwarded = headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded !== '') {
    return forwarded.split(',')[0].trim()
  }
  const direct = headers['x-nf-client-connection-ip']
  if (typeof direct === 'string' && direct !== '') return direct
  return undefined
}

export const createRateLimiter = ({ limit = 30, windowMs = 60_000 } = {}) => {
  const buckets = new Map()
  const refillPerMs = limit / windowMs

  return {
    check(key) {
      const now = Date.now()
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { tokens: limit, updatedAt: now }
        buckets.set(key, bucket)
      }
      bucket.tokens = Math.min(limit, bucket.tokens + (now - bucket.updatedAt) * refillPerMs)
      bucket.updatedAt = now
      if (buckets.size > 1000) {
        // Lazy cleanup: drop buckets idle for a whole window so the
        // map cannot grow without bound.
        for (const [storedKey, stored] of buckets) {
          if (now - stored.updatedAt > windowMs) buckets.delete(storedKey)
        }
      }
      if (bucket.tokens < 1) {
        return {
          allowed: false,
          retryAfterMs: Math.ceil((1 - bucket.tokens) / refillPerMs),
        }
      }
      bucket.tokens -= 1
      return { allowed: true, retryAfterMs: 0 }
    },
    clear() {
      buckets.clear()
    },
  }
}

export const createResponseCache = ({ ttlMs = 300_000, maxEntries = 200 } = {}) => {
  const entries = new Map()

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (Date.now() > entry.expiresAt) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value) {
      if (entries.size >= maxEntries) {
        // Drop the oldest entry; Map preserves insertion order.
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(key, { value, expiresAt: Date.now() + ttlMs })
    },
    clear() {
      entries.clear()
    },
  }
}
