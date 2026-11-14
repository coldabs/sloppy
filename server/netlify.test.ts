// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../server/fetch.mjs', () => {
  class FetchError extends Error {
    constructor(status, code, message) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  return {
    FetchError,
    fetchPage: vi.fn(),
    fetchCss: vi.fn(),
  }
})

import { handler as cssHandler } from '../netlify/functions/css.mjs'
import { handler as fetchHandler } from '../netlify/functions/fetch.mjs'
import { handler as healthHandler } from '../netlify/functions/health.mjs'
import { FetchError, fetchCss, fetchPage } from '../server/fetch.mjs'

const pageMock = vi.mocked(fetchPage)
const cssMock = vi.mocked(fetchCss)

const makeEvent = (url: string, method = 'GET') => ({
  httpMethod: method,
  rawUrl: `http://localhost${url}`,
  queryStringParameters: Object.fromEntries(new URL(url, 'http://localhost').searchParams),
})

const parse = (result) => JSON.parse(result.body)

beforeEach(() => {
  pageMock.mockReset()
  cssMock.mockReset()
})

describe('Netlify page fetch function', () => {
  it('rejects a missing URL', async () => {
    const result = await fetchHandler(makeEvent('/api/fetch'))
    expect(result.statusCode).toBe(400)
    expect(parse(result).error).toBe('missing-url')
  })

  it('rejects non-GET methods', async () => {
    const result = await fetchHandler(makeEvent('/api/fetch?url=https://example.com', 'POST'))
    expect(result.statusCode).toBe(405)
  })

  it('returns fetched HTML as JSON', async () => {
    pageMock.mockResolvedValue({
      url: 'https://example.com/',
      contentType: 'text/html',
      html: '<html><body><h1>Hi</h1></body></html>',
    })
    const result = await fetchHandler(makeEvent('/api/fetch?url=https%3A%2F%2Fexample.com'))
    expect(result.statusCode).toBe(200)
    expect(parse(result).url).toBe('https://example.com/')
    expect(parse(result).html).toContain('<h1>Hi</h1>')
    expect(pageMock).toHaveBeenCalledWith('https://example.com', { allowPrivate: false })
  })

  it('passes guard errors through with their status', async () => {
    pageMock.mockRejectedValue(new FetchError(403, 'blocked-address', 'Blocked.'))
    const result = await fetchHandler(makeEvent('/api/fetch?url=http%3A%2F%2F127.0.0.1%2F'))
    expect(result.statusCode).toBe(403)
    expect(parse(result).error).toBe('blocked-address')
  })
})

describe('Netlify stylesheet function', () => {
  it('returns fetched CSS as JSON', async () => {
    cssMock.mockResolvedValue({
      url: 'https://example.com/site.css',
      css: '.a{color:red}',
    })
    const result = await cssHandler(
      makeEvent('/api/css?url=https%3A%2F%2Fexample.com%2Fsite.css'),
    )
    expect(result.statusCode).toBe(200)
    expect(parse(result).css).toContain('color:red')
  })

  it('treats a failed stylesheet as optional', async () => {
    cssMock.mockRejectedValue(new FetchError(502, 'http-error', 'Upstream failed.'))
    const result = await cssHandler(
      makeEvent('/api/css?url=https%3A%2F%2Fexample.com%2Fsite.css'),
    )
    expect(result.statusCode).toBe(200)
    expect(parse(result).css).toBe('')
  })

  it('passes target guard errors through', async () => {
    cssMock.mockRejectedValue(new FetchError(403, 'blocked-port', 'Blocked.'))
    const result = await cssHandler(
      makeEvent('/api/css?url=http%3A%2F%2F127.0.0.1%2Fstyle.css'),
    )
    expect(result.statusCode).toBe(403)
  })
})

describe('Netlify health function', () => {
  it('reports a working endpoint', async () => {
    const result = await healthHandler(makeEvent('/api/health'))
    expect(result.statusCode).toBe(200)
    expect(parse(result)).toEqual({ ok: true, mode: 'netlify' })
  })
})
