import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const MAX_HTML_BYTES = 3 * 1024 * 1024
export const MAX_CSS_BYTES = 512 * 1024
export const MAX_REDIRECTS = 3
export const FETCH_TIMEOUT_MS = 10000
const ALLOWED_PORTS = new Set(['', '80', '443'])
const USER_AGENT = 'sloppy-audit/1.0 (local pattern checker)'

export class FetchError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const isPrivateAddress = (address) => {
  const value = address.trim().toLowerCase().replace(/^\[|\]$/g, '')
  const version = isIP(value)

  if (version === 4) {
    const octets = value.split('.').map(Number)
    const [a, b] = octets
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 192 && b === 0) return true
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return true
    if (a === 203 && b === 0) return true
    if (a >= 224) return true
    return false
  }

  if (version === 6) {
    if (value === '::' || value === '::1') return true
    if (value.startsWith('::ffff:')) {
      return isPrivateAddress(value.slice('::ffff:'.length))
    }
    if (/^f[cd]/.test(value)) return true
    if (value.startsWith('fe80') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true
    if (value.startsWith('ff')) return true
    if (value.startsWith('2001:db8')) return true
    return false
  }

  return true
}

const normaliseInput = (input) => {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new FetchError(400, 'missing-url', 'Enter a page URL to scan.')
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export const validateTarget = async (input, { allowPrivate = false } = {}) => {
  let url
  const target = normaliseInput(input)
  try {
    url = new URL(target)
  } catch {
    throw new FetchError(400, 'invalid-url', 'That is not a valid URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError(403, 'blocked-protocol', 'Only http and https pages can be scanned.')
  }
  if (url.username || url.password) {
    throw new FetchError(403, 'blocked-credentials', 'URLs with embedded credentials are blocked.')
  }
  if (!allowPrivate && !ALLOWED_PORTS.has(url.port)) {
    throw new FetchError(403, 'blocked-port', 'Only ports 80 and 443 are allowed.')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (!hostname) {
    throw new FetchError(400, 'invalid-url', 'That URL has no hostname.')
  }

  let records
  if (isIP(hostname)) {
    records = [{ address: hostname }]
  } else {
    try {
      records = await lookup(hostname, { all: true, verbatim: true })
    } catch {
      throw new FetchError(502, 'dns-failed', `The host ${hostname} could not be resolved.`)
    }
  }

  if (records.length === 0) {
    throw new FetchError(502, 'dns-failed', `The host ${hostname} could not be resolved.`)
  }

  if (!allowPrivate && records.some((record) => isPrivateAddress(record.address))) {
    throw new FetchError(
      403,
      'blocked-address',
      'Private, loopback, and local network addresses are blocked.',
    )
  }

  return url
}

const readLimited = async (response, limit) => {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      throw new FetchError(413, 'too-large', 'The response is larger than the scan limit.')
    }
    chunks.push(value)
  }

  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8').decode(buffer)
}

const request = async (url) => {
  let response
  try {
    response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,text/css;q=0.9,*/*;q=0.1',
      },
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new FetchError(504, 'timeout', 'The site took too long to respond.')
    }
    throw new FetchError(502, 'network-failed', 'The site could not be reached.')
  }
  return response
}

const follow = async (input, { allowPrivate } = {}) => {
  let current = await validateTarget(input, { allowPrivate })

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await request(current)

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) {
        throw new FetchError(502, 'bad-redirect', 'The site sent a redirect with no destination.')
      }
      if (hop === MAX_REDIRECTS) {
        throw new FetchError(502, 'too-many-redirects', 'The site redirected too many times.')
      }
      current = await validateTarget(new URL(location, current).href, { allowPrivate })
      continue
    }

    return { response, url: current }
  }

  throw new FetchError(502, 'too-many-redirects', 'The site redirected too many times.')
}

export const fetchPage = async (input, { allowPrivate = false } = {}) => {
  const { response, url } = await follow(input, { allowPrivate })

  if (!response.ok) {
    await response.body?.cancel()
    const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
    throw new FetchError(502, 'http-error', `The page returned HTTP ${status}.`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    await response.body?.cancel()
    throw new FetchError(415, 'not-html', 'That URL did not return an HTML page.')
  }

  const html = await readLimited(response, MAX_HTML_BYTES)
  return { url: url.href, contentType, html }
}

export const fetchCss = async (input, pageUrl, { allowPrivate = false } = {}) => {
  const page = new URL(pageUrl)
  const cssUrl = new URL(input, page)
  if (cssUrl.origin !== page.origin) {
    throw new FetchError(403, 'cross-origin-css', 'Only same-origin stylesheets are fetched.')
  }

  const { response, url } = await follow(cssUrl.href, { allowPrivate })

  if (!response.ok) {
    await response.body?.cancel()
    throw new FetchError(502, 'http-error', `The stylesheet returned HTTP ${response.status}.`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType && !/text\/css/i.test(contentType)) {
    await response.body?.cancel()
    throw new FetchError(415, 'not-css', 'That URL did not return CSS.')
  }

  const css = await readLimited(response, MAX_CSS_BYTES)
  if (new URL(url.href).origin !== page.origin) {
    throw new FetchError(403, 'cross-origin-css', 'The stylesheet redirected off the page origin.')
  }
  return { url: url.href, css }
}
