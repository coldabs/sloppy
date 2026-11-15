// @vitest-environment node
// F71 — per-IP token bucket and short response cache for the public
// fetch endpoints.
import { describe, expect, it } from 'vitest'
import {
  clientIpFromHeaders,
  createRateLimiter,
  createResponseCache,
} from './rateLimit.mjs'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('F71: token-bucket rate limiter', () => {
  it('allows a burst of `limit`, then blocks', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 })
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('a').allowed).toBe(true)
    const blocked = limiter.check('a')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })

  it('buckets are per key', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('a').allowed).toBe(false)
    expect(limiter.check('b').allowed).toBe(true)
  })

  it('refills after the window', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 100 })
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('a').allowed).toBe(false)
    await sleep(150)
    expect(limiter.check('a').allowed).toBe(true)
  })
})

describe('F71: response cache', () => {
  it('returns what was stored until the TTL expires', async () => {
    const cache = createResponseCache({ ttlMs: 100, maxEntries: 10 })
    expect(cache.get('k')).toBeUndefined()
    cache.set('k', 'v')
    expect(cache.get('k')).toBe('v')
    await sleep(150)
    expect(cache.get('k')).toBeUndefined()
  })

  it('drops the oldest entry when full', () => {
    const cache = createResponseCache({ ttlMs: 60_000, maxEntries: 2 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })
})

describe('F71: client IP from headers', () => {
  it('takes the first X-Forwarded-For entry, then the Netlify header', () => {
    expect(
      clientIpFromHeaders({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }),
    ).toBe('203.0.113.7')
    expect(
      clientIpFromHeaders({ 'x-nf-client-connection-ip': '203.0.113.8' }),
    ).toBe('203.0.113.8')
    expect(clientIpFromHeaders({})).toBeUndefined()
  })
})
