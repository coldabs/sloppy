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

import cssHandler from '../api/css.js'
import fetchHandler from '../api/fetch.js'
import healthHandler from '../api/health.js'
import {
  FetchError,
  fetchCss,
  fetchPage,
} from '../server/fetch.mjs'

const pageMock = vi.mocked(fetchPage)
const cssMock = vi.mocked(fetchCss)

const createResponse = () => {
  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      response.headers[name] = value
    },
    end(chunk) {
      response.body += chunk
    },
  }
  return response
}

const call = async (handler, request) => {
  const response = createResponse()
  await handler(request, response)
  return {
    status: response.statusCode,
    headers: response.headers,
    body: response.body ? JSON.parse(response.body) : null,
  }
}

beforeEach(() => {
  pageMock.mockReset()
  cssMock.mockReset()
})

describe('Vercel health handler', () => {
  it('reports a working serverless endpoint', async () => {
    const result = await call(healthHandler, { method: 'GET', query: {}, url: '/api/health' })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, mode: 'serverless' })
  })

  it('rejects non-GET methods', async () => {
    const result = await call(healthHandler, { method: 'POST', query: {}, url: '/api/health' })
    expect(result.status).toBe(405)
  })
})

describe('Vercel page fetch handler', () => {
  it('rejects a missing URL', async () => {
    const result = await call(fetchHandler, { method: 'GET', query: {}, url: '/api/fetch' })
    expect(result.status).toBe(400)
    expect(result.body.error).toBe('missing-url')
  })

  it('rejects non-GET methods', async () => {
    const result = await call(fetchHandler, {
      method: 'POST',
      query: { url: 'https://1.1.1.1/' },
      url: '/api/fetch',
    })
    expect(result.status).toBe(405)
  })

  it('returns the fetched HTML as JSON', async () => {
    pageMock.mockResolvedValue({
      url: 'https://example.com/',
      contentType: 'text/html',
      html: '<html><body><h1>Hi</h1></body></html>',
    })
    const result = await call(fetchHandler, {
      method: 'GET',
      query: { url: 'https://example.com/' },
      url: '/api/fetch',
    })
    expect(result.status).toBe(200)
    expect(result.body.url).toBe('https://example.com/')
    expect(result.body.html).toContain('<h1>Hi</h1>')
    expect(pageMock).toHaveBeenCalledWith('https://example.com/', { allowPrivate: false })
  })

  it('passes guard errors through with their status', async () => {
    pageMock.mockRejectedValue(new FetchError(403, 'blocked-address', 'Blocked.'))
    const result = await call(fetchHandler, {
      method: 'GET',
      query: { url: 'http://127.0.0.1/' },
      url: '/api/fetch',
    })
    expect(result.status).toBe(403)
    expect(result.body.error).toBe('blocked-address')
  })
})

describe('Vercel stylesheet handler', () => {
  it('returns fetched CSS as JSON', async () => {
    cssMock.mockResolvedValue({ url: 'https://example.com/site.css', css: '.a{color:red}' })
    const result = await call(cssHandler, {
      method: 'GET',
      query: { url: 'https://example.com/site.css' },
      url: '/api/css',
    })
    expect(result.status).toBe(200)
    expect(result.body.css).toContain('color:red')
  })

  it('passes target guard errors through', async () => {
    cssMock.mockRejectedValue(new FetchError(403, 'blocked-port', 'Blocked.'))
    const result = await call(cssHandler, {
      method: 'GET',
      query: { url: 'http://127.0.0.1/style.css' },
      url: '/api/css',
    })
    expect(result.status).toBe(403)
  })

  it('treats a failed stylesheet as optional', async () => {
    cssMock.mockRejectedValue(new FetchError(502, 'http-error', 'Upstream failed.'))
    const result = await call(cssHandler, {
      method: 'GET',
      query: { url: 'https://example.com/style.css' },
      url: '/api/css',
    })
    expect(result.status).toBe(200)
    expect(result.body.css).toBe('')
  })
})
