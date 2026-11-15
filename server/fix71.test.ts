// @vitest-environment node
// F71 — the shared handlers enforce the per-IP rate limit and the
// 5-minute cache, proved against a real local server (allowPrivate,
// so the loopback target is reachable in the test).
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleFetchCss, handleFetchPage } from './handlers.mjs'
import { createRateLimiter, createResponseCache } from './rateLimit.mjs'

let hits = 0
let server: Server
let port = 0

beforeAll(async () => {
  server = createServer((request, response) => {
    hits += 1
    if (request.url === '/plain.txt') {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('not html')
      return
    }
    if (request.url?.endsWith('.css')) {
      response.writeHead(200, { 'content-type': 'text/css' })
      response.end('.a { color: red; }')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<!doctype html><title>T</title><p>Hi.</p>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const pageUrl = () => `http://127.0.0.1:${port}/`
const cssUrl = () => `http://127.0.0.1:${port}/a.css`

describe('F71: handler rate limit and cache', () => {
  it('returns 429 after the per-IP burst, and another IP is unaffected', async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 })
    const options = { ip: '203.0.113.1', allowPrivate: true, limiter, cache: createResponseCache() }
    // Two distinct URLs so the cache cannot answer the second call.
    expect((await handleFetchPage('GET', `${pageUrl()}?a=1`, options)).status).toBe(200)
    expect((await handleFetchPage('GET', `${pageUrl()}?a=2`, options)).status).toBe(200)
    const limited = await handleFetchPage('GET', `${pageUrl()}?a=3`, options)
    expect(limited.status).toBe(429)
    expect(limited.payload.error).toBe('rate-limited')
    // A different client IP has its own budget.
    const other = await handleFetchPage('GET', `${pageUrl()}?a=3`, {
      ...options,
      ip: '203.0.113.2',
    })
    expect(other.status).toBe(200)
  })

  it('serves a repeated page from the cache without re-fetching', async () => {
    const cache = createResponseCache()
    const options = {
      ip: '203.0.113.3',
      allowPrivate: true,
      limiter: createRateLimiter({ limit: 30, windowMs: 60_000 }),
      cache,
    }
    const before = hits
    const first = await handleFetchPage('GET', pageUrl(), options)
    expect(first.status).toBe(200)
    expect(hits).toBe(before + 1)
    const second = await handleFetchPage('GET', pageUrl(), options)
    expect(second).toEqual(first)
    expect(hits).toBe(before + 1)
  })

  it('does not cache failures: a non-HTML target is fetched every time', async () => {
    const cache = createResponseCache()
    const options = {
      ip: '203.0.113.4',
      allowPrivate: true,
      limiter: createRateLimiter({ limit: 30, windowMs: 60_000 }),
      cache,
    }
    const plain = `${pageUrl()}plain.txt`
    const before = hits
    const first = await handleFetchPage('GET', plain, options)
    expect(first.status).toBe(415)
    expect(first.payload.error).toBe('not-html')
    const second = await handleFetchPage('GET', plain, options)
    expect(second.status).toBe(415)
    expect(hits).toBe(before + 2)
  })

  it('a limited stylesheet still answers 200 with empty CSS, not 429', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    const options = {
      ip: '203.0.113.5',
      allowPrivate: true,
      limiter,
      cache: createResponseCache(),
    }
    const first = await handleFetchCss('GET', cssUrl(), options)
    expect(first.status).toBe(200)
    expect(first.payload.css).toContain('color: red')
    const limited = await handleFetchCss('GET', `${cssUrl()}?b=2`, options)
    expect(limited.status).toBe(200)
    expect(limited.payload).toEqual({ url: `${cssUrl()}?b=2`, css: '' })
  })

  it('caches stylesheets too', async () => {
    const cache = createResponseCache()
    const options = {
      ip: '203.0.113.6',
      allowPrivate: true,
      limiter: createRateLimiter({ limit: 30, windowMs: 60_000 }),
      cache,
    }
    const before = hits
    const first = await handleFetchCss('GET', cssUrl(), options)
    expect(first.status).toBe(200)
    expect(hits).toBe(before + 1)
    const second = await handleFetchCss('GET', cssUrl(), options)
    expect(second).toEqual(first)
    expect(hits).toBe(before + 1)
  })
})
