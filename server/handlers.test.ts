// @vitest-environment node
import { describe, expect, it } from 'vitest'
import vercelCss from '../api/css.js'
import vercelFetch from '../api/fetch.js'
import vercelHealth from '../api/health.js'
import { handler as netlifyCss } from '../netlify/functions/css.mjs'
import { handler as netlifyFetch } from '../netlify/functions/fetch.mjs'
import { handler as netlifyHealth } from '../netlify/functions/health.mjs'
import { handleFetchCss, handleFetchPage, handleHealth } from './handlers.mjs'

describe('F14: one shared handlers module', () => {
  it('validates the fetch page request', async () => {
    expect(await handleFetchPage('POST', 'https://example.com/')).toEqual({
      status: 405,
      payload: { error: 'method-not-allowed', message: 'Use GET.' },
    })
    expect(await handleFetchPage('GET', '')).toEqual({
      status: 400,
      payload: { error: 'missing-url', message: 'Enter a page URL to scan.' },
    })
    expect(await handleFetchPage('GET', `https://example.com/${'x'.repeat(2048)}`)).toEqual({
      status: 414,
      payload: { error: 'url-too-long', message: 'That URL is too long.' },
    })
    // The guard runs through the shared path.
    expect(await handleFetchPage('GET', 'http://127.0.0.1/')).toEqual({
      status: 403,
      payload: {
        error: 'blocked-address',
        message: 'Private, loopback, and local network addresses are blocked.',
      },
    })
  })

  it('validates the css request and never fails a scan over one sheet', async () => {
    expect(await handleFetchCss('POST', 'https://example.com/a.css')).toEqual({
      status: 405,
      payload: { error: 'method-not-allowed', message: 'Use GET.' },
    })
    expect(await handleFetchCss('GET', '')).toEqual({
      status: 400,
      payload: { error: 'invalid-request', message: 'A stylesheet URL is required.' },
    })
    expect(await handleFetchCss('GET', `https://example.com/${'x'.repeat(4096)}`)).toEqual({
      status: 400,
      payload: { error: 'invalid-request', message: 'A stylesheet URL is required.' },
    })
    expect(await handleFetchCss('GET', 'http://127.0.0.1/a.css')).toEqual({
      status: 403,
      payload: {
        error: 'blocked-address',
        message: 'Private, loopback, and local network addresses are blocked.',
      },
    })
    // A non-403 failure (an unparseable host) still answers 200
    // with empty CSS — stylesheets are optional enrichment.
    expect(await handleFetchCss('GET', 'http://256.256.256.256/a.css')).toEqual({
      status: 200,
      payload: { url: 'http://256.256.256.256/a.css', css: '' },
    })
  })

  it('answers health with the platform mode marker', () => {
    expect(handleHealth('GET', 'serverless')).toEqual({
      status: 200,
      payload: { ok: true, mode: 'serverless' },
    })
    expect(handleHealth('GET', 'netlify')).toEqual({
      status: 200,
      payload: { ok: true, mode: 'netlify' },
    })
    expect(handleHealth('POST', 'netlify')).toEqual({
      status: 405,
      payload: { error: 'method-not-allowed', message: 'Use GET.' },
    })
  })

  it('wires the Vercel adapters to the shared handlers', async () => {
    const fakeRes = () => {
      let body = ''
      const res = {
        statusCode: 0,
        headers: {} as Record<string, string>,
        setHeader: (name: string, value: string) => {
          res.headers[name] = value
        },
        end: (text: string) => {
          body = text
        },
      }
      return { res, body: () => JSON.parse(body) }
    }
    const { res, body } = fakeRes()
    await vercelFetch({ method: 'POST', query: {}, url: '/api/fetch' }, res)
    expect(res.statusCode).toBe(405)
    expect(body().error).toBe('method-not-allowed')
    const { res: res2, body: body2 } = fakeRes()
    await vercelCss({ method: 'GET', query: {}, url: '/api/css' }, res2)
    expect(res2.statusCode).toBe(400)
    expect(body2().error).toBe('invalid-request')
    const { res: res3, body: body3 } = fakeRes()
    vercelHealth({ method: 'GET' }, res3)
    expect(res3.statusCode).toBe(200)
    expect(body3()).toEqual({ ok: true, mode: 'serverless' })
  })

  it('wires the Netlify adapters to the shared handlers', async () => {
    const fetch = await netlifyFetch({
      httpMethod: 'POST',
      queryStringParameters: {},
      rawUrl: 'https://example.com/.netlify/functions/fetch',
    })
    expect(fetch.statusCode).toBe(405)
    expect(JSON.parse(fetch.body).error).toBe('method-not-allowed')
    const css = await netlifyCss({
      httpMethod: 'GET',
      queryStringParameters: {},
      rawUrl: 'https://example.com/.netlify/functions/css',
    })
    expect(css.statusCode).toBe(400)
    expect(JSON.parse(css.body).error).toBe('invalid-request')
    const health = await netlifyHealth({ httpMethod: 'GET' })
    expect(health.statusCode).toBe(200)
    expect(JSON.parse(health.body)).toEqual({ ok: true, mode: 'netlify' })
  })
})
