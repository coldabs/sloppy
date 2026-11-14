// @vitest-environment node
import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FetchError, fetchCss, fetchPage } from './fetch.mjs'

let server: http.Server
let port: number

const codeOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn()
    return null
  } catch (error) {
    return error instanceof FetchError ? error.code : `unknown:${String(error)}`
  }
}

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        const url = req.url ?? '/'
        if (url === '/ok') {
          res.writeHead(200, { 'content-type': 'text/html' })
          res.end('<html><head><title>T</title></head><body><h1>Hi</h1></body></html>')
        } else if (url === '/css-ok') {
          res.writeHead(200, { 'content-type': 'text/css' })
          res.end('.a { color: red; }')
        } else if (url === '/json') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end('{}')
        } else if (url === '/big') {
          res.writeHead(200, { 'content-type': 'text/html' })
          res.end('x'.repeat(4 * 1024 * 1024))
        } else if (url === '/missing') {
          res.writeHead(404, { 'content-type': 'text/html' })
          res.end('nope')
        } else if (url === '/slow') {
          setTimeout(() => {
            res.writeHead(200, { 'content-type': 'text/html' })
            res.end('late')
          }, 12000)
        } else if (url.startsWith('/hop/')) {
          const n = Number(url.slice(5))
          if (n >= 3) {
            res.writeHead(200, { 'content-type': 'text/html' })
            res.end('done')
          } else {
            res.writeHead(302, { location: `/hop/${n + 1}` })
            res.end()
          }
        } else if (url === '/loop') {
          res.writeHead(302, { location: '/loop' })
          res.end()
        } else if (url === '/no-location') {
          res.writeHead(302)
          res.end()
        } else if (url === '/to-ftp') {
          res.writeHead(302, { location: 'ftp://example.com/x' })
          res.end()
        } else {
          res.writeHead(404)
          res.end()
        }
      })
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as { port: number }).port
        resolve()
      })
    }),
)

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve())
    }),
)

describe('fetch guards against a local server', () => {
  it('fetches a page by IP literal and by hostname', async () => {
    const byIp = await fetchPage(`http://127.0.0.1:${port}/ok`, { allowPrivate: true })
    console.log('FETCH by-ip:', byIp.url, byIp.html.length)
    expect(byIp.html).toContain('<h1>Hi</h1>')
    const byName = await fetchPage(`http://localhost:${port}/ok`, { allowPrivate: true })
    console.log('FETCH by-hostname:', byName.url)
    expect(byName.html).toContain('<h1>Hi</h1>')
  })

  it('follows up to 3 redirects and stops at 4', async () => {
    const ok = await fetchPage(`http://127.0.0.1:${port}/hop/0`, { allowPrivate: true })
    expect(ok.html).toBe('done')
    expect(await codeOf(() => fetchPage(`http://127.0.0.1:${port}/loop`, { allowPrivate: true }))).toBe('too-many-redirects')
    expect(await codeOf(() => fetchPage(`http://127.0.0.1:${port}/no-location`, { allowPrivate: true }))).toBe('bad-redirect')
    expect(await codeOf(() => fetchPage(`http://127.0.0.1:${port}/to-ftp`, { allowPrivate: true }))).toBe('blocked-protocol')
  })

  it('enforces content type, size, status, and timeout', { timeout: 15000 }, async () => {
    expect(await codeOf(() => fetchPage(`http://127.0.0.1:${port}/json`, { allowPrivate: true }))).toBe('not-html')
    expect(await codeOf(() => fetchPage(`http://127.0.0.1:${port}/big`, { allowPrivate: true }))).toBe('too-large')
    expect(await codeOf(() => fetchPage(`http://127.0.0.1:${port}/missing`, { allowPrivate: true }))).toBe('http-error')
    expect(await codeOf(() => fetchPage(`http://127.0.0.1:${port}/slow`, { allowPrivate: true }))).toBe('timeout')
  })

  it('fetches same-origin CSS and rejects bad page URLs as FetchError', async () => {
    const css = await fetchCss('/css-ok', `http://127.0.0.1:${port}/ok`, { allowPrivate: true })
    expect(css.css).toContain('color: red')
    expect(await codeOf(() => fetchCss('/css-ok', 'not a url', { allowPrivate: true }))).toBe('invalid-url')
    expect(await codeOf(() => fetchCss('https://example.com/x.css', `http://127.0.0.1:${port}/ok`, { allowPrivate: true }))).toBe('cross-origin-css')
  })
})
