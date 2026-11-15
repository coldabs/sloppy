import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { FetchError, fetchCss, fetchPage } from './server/fetch.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.resolve(root, 'dist')
const isDev = process.argv.includes('--dev')
const allowPrivate = process.env.SLOPPY_ALLOW_PRIVATE === '1'
const port = Number(process.env.PORT ?? (isDev ? 5173 : 4173))

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

const sendJson = (response, status, payload) => {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  response.end(body)
}

const runFetch = async (action) => {
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    if (error instanceof FetchError) {
      return {
        ok: false,
        status: error.status,
        body: { error: error.code, message: error.message },
      }
    }
    return {
      ok: false,
      status: 502,
      body: { error: 'fetch-failed', message: 'The page could not be fetched.' },
    }
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

const hostnameOf = (hostHeader) => {
  const raw = (hostHeader ?? '').trim()
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']')
    return end === -1 ? '' : raw.slice(1, end).toLowerCase()
  }
  return raw.split(':')[0].toLowerCase()
}

// Whether an API request comes from this server (F11): the Host
// header must name a loopback host, and when an Origin header is
// present it must name one too.
const isLocalApiRequest = (request) => {
  if (!LOOPBACK_HOSTS.has(hostnameOf(request.headers.host))) return false
  const origin = request.headers.origin
  if (!origin) return true
  let originUrl
  try {
    originUrl = new URL(origin)
  } catch {
    return false
  }
  return LOOPBACK_HOSTS.has(originUrl.hostname.toLowerCase())
}

const handleApi = async (request, response, url) => {
  if (!url.pathname.startsWith('/api/')) return false

  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'method-not-allowed', message: 'Use GET.' })
    return true
  }

  // The fetch endpoints trigger outbound requests, so they only
  // answer callers that are actually this server (F11). A Host
  // header naming another host means DNS rebinding (a foreign name
  // resolving to 127.0.0.1); a foreign Origin means a page on
  // another site is driving the local API. Requests with no Origin
  // (curl, same-origin navigations) are allowed, and a loopback
  // Origin on any port is allowed — a split local setup (the app
  // served from another port) is the user's own machine.
  if (url.pathname === '/api/fetch' || url.pathname === '/api/css') {
    if (!isLocalApiRequest(request)) {
      sendJson(response, 403, {
        error: 'forbidden-origin',
        message: 'The fetch API only answers requests from this server.',
      })
      return true
    }
  }

  if (url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true })
    return true
  }

  if (url.pathname === '/api/fetch') {
    const target = url.searchParams.get('url') ?? ''
    if (target.length > 2048) {
      sendJson(response, 414, { error: 'url-too-long', message: 'That URL is too long.' })
      return true
    }
    const result = await runFetch(() => fetchPage(target, { allowPrivate }))
    if (result.ok) sendJson(response, 200, result.value)
    else sendJson(response, result.status, result.body)
    return true
  }

  if (url.pathname === '/api/css') {
    const target = url.searchParams.get('url') ?? ''
    if (!target || target.length > 4096) {
      sendJson(response, 400, {
        error: 'invalid-request',
        message: 'A stylesheet URL is required.',
      })
      return true
    }
    const result = await runFetch(() => fetchCss(target, { allowPrivate }))
    if (result.ok) {
      sendJson(response, 200, result.value)
    } else if (result.status === 403) {
      sendJson(response, 403, result.body)
    } else {
      // Stylesheets are optional enrichment. A blocked, slow, or oversized
      // sheet should not fail the page scan or log a console error.
      sendJson(response, 200, { url: target, css: '' })
    }
    return true
  }

  sendJson(response, 404, { error: 'not-found', message: 'Unknown API route.' })
  return true
}

const serveStatic = async (request, response, url) => {
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Bad request')
    return
  }

  if (pathname.includes('\0')) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Bad request')
    return
  }

  let filePath = path.resolve(distRoot, `.${pathname}`)
  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${path.sep}`)) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Forbidden')
    return
  }

  let info = await stat(filePath).catch(() => null)
  if (info?.isDirectory()) {
    filePath = path.join(filePath, 'index.html')
    info = await stat(filePath).catch(() => null)
  }

  if (!info) {
    if (path.extname(pathname)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }
    filePath = path.join(distRoot, 'index.html')
    info = await stat(filePath).catch(() => null)
  }

  if (!info) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('No build found. Run npm run build first.')
    return
  }

  const extension = path.extname(filePath).toLowerCase()
  response.writeHead(200, {
    'content-type': mimeTypes[extension] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(response)
}

let vite = null

const server = http.createServer(async (request, response) => {
  let url
  try {
    url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Bad request')
    return
  }

  try {
    if (await handleApi(request, response, url)) return

    if (vite) {
      vite.middlewares(request, response, () => {
        if (!response.headersSent) {
          response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          response.end('Not found')
        }
      })
      return
    }

    await serveStatic(request, response, url)
  } catch {
    if (!response.headersSent) {
      sendJson(response, 500, {
        error: 'server-error',
        message: 'The local server failed to answer.',
      })
    } else {
      response.end()
    }
  }
})

if (isDev) {
  vite = await createViteServer({
    root,
    appType: 'spa',
    server: {
      middlewareMode: true,
      hmr: { server },
    },
  })
}

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. An old dev server is probably running. Stop it, then run npm run dev again.`,
    )
  } else {
    console.error(error)
  }
  process.exit(1)
})

server.listen(port, '127.0.0.1', () => {
  const mode = isDev ? 'dev' : 'production'
  console.log(`sloppy ${mode} server: http://localhost:${port}/`)
  if (allowPrivate) {
    console.log('SLOPPY_ALLOW_PRIVATE=1: local and private addresses are allowed for this run.')
  }
})

const shutdown = async () => {
  await vite?.close()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
