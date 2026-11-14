import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
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

export const validateTarget = async (input, options) => {
  const { url } = await resolveTarget(input, options)
  return url
}

// Validates a target and resolves it once, returning the addresses that
// were checked. The fetch below connects to exactly one of these
// addresses — it never resolves the hostname a second time — so a
// hostname whose DNS answer changes between validation and fetch cannot
// smuggle a private address past the guard. That closes the
// DNS-rebinding gap between validateTarget and fetch: the lookup the
// connection uses is pinned to the lookup that was validated.
const resolveTarget = async (input, { allowPrivate = false } = {}) => {
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
    records = [{ address: hostname, family: isIP(hostname) }]
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

  return {
    url,
    addresses: records.map((record) => ({
      address: record.address,
      family: record.family,
    })),
  }
}

const readLimited = async (stream, limit) => {
  const chunks = []
  let total = 0
  try {
    for await (const chunk of stream) {
      total += chunk.byteLength
      if (total > limit) {
        stream.destroy()
        throw new FetchError(413, 'too-large', 'The response is larger than the scan limit.')
      }
      chunks.push(chunk)
    }
  } catch (error) {
    if (error instanceof FetchError) throw error
    if (error?.message === 'timeout') {
      throw new FetchError(504, 'timeout', 'The site took too long to respond.')
    }
    throw new FetchError(502, 'network-failed', 'The site could not be reached.')
  }

  return new TextDecoder('utf-8').decode(Buffer.concat(chunks, total))
}

// One request, with DNS pinned to the addresses that were validated for
// this target. The connection never performs its own lookup, so the
// address it connects to is one of the addresses the guard already
// approved. TLS still verifies against the hostname, not the IP.
const request = (target) =>
  new Promise((resolve, reject) => {
    const { url, addresses } = target
    const lib = url.protocol === 'https:' ? https : http
    let settled = false
    let timedOut = false
    const fail = (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    }
    const lookupPinned = (hostname, options, callback) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      const wanted = options?.family ?? 0
      const pool = wanted
        ? addresses.filter((record) => record.family === wanted)
        : addresses
      const use = pool.length > 0 ? pool : addresses
      if (options?.all) {
        callback(
          null,
          use.map((record) => ({ address: record.address, family: record.family })),
        )
      } else {
        callback(null, use[0].address, use[0].family)
      }
    }
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,text/css;q=0.9,*/*;q=0.1',
        },
        lookup: lookupPinned,
      },
      (response) => {
        response.on('end', () => req.setTimeout(0))
        resolve({
          status: response.statusCode,
          statusMessage: response.statusMessage,
          headers: response.headers,
          body: response,
        })
      },
    )
    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      timedOut = true
      req.destroy(new Error('timeout'))
    })
    req.on('error', () => {
      fail(
        timedOut
          ? new FetchError(504, 'timeout', 'The site took too long to respond.')
          : new FetchError(502, 'network-failed', 'The site could not be reached.'),
      )
    })
    req.end()
  })

const follow = async (input, { allowPrivate } = {}) => {
  let current = await resolveTarget(input, { allowPrivate })

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await request(current)

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location
      response.body.destroy()
      if (!location) {
        throw new FetchError(502, 'bad-redirect', 'The site sent a redirect with no destination.')
      }
      if (hop === MAX_REDIRECTS) {
        throw new FetchError(502, 'too-many-redirects', 'The site redirected too many times.')
      }
      let next
      try {
        next = new URL(location, current.url).href
      } catch {
        throw new FetchError(502, 'bad-redirect', 'The site sent a redirect with no destination.')
      }
      // Every hop is resolved and validated again, with its own pinned
      // lookup, so a redirect cannot hop to a private address either.
      current = await resolveTarget(next, { allowPrivate })
      continue
    }

    return { response, url: current.url }
  }

  throw new FetchError(502, 'too-many-redirects', 'The site redirected too many times.')
}

export const fetchPage = async (input, { allowPrivate = false } = {}) => {
  const { response, url } = await follow(input, { allowPrivate })

  if (response.status < 200 || response.status >= 300) {
    response.body.destroy()
    const status = `${response.status}${response.statusMessage ? ` ${response.statusMessage}` : ''}`
    throw new FetchError(502, 'http-error', `The page returned HTTP ${status}.`)
  }

  const contentType = response.headers['content-type'] ?? ''
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    response.body.destroy()
    throw new FetchError(415, 'not-html', 'That URL did not return an HTML page.')
  }

  const html = await readLimited(response.body, MAX_HTML_BYTES)
  return { url: url.href, contentType, html }
}

export const fetchCss = async (input, pageUrl, { allowPrivate = false } = {}) => {
  let page
  try {
    page = new URL(pageUrl)
  } catch {
    throw new FetchError(400, 'invalid-url', 'That is not a valid page URL.')
  }
  let cssUrl
  try {
    cssUrl = new URL(input, page)
  } catch {
    throw new FetchError(400, 'invalid-url', 'That is not a valid stylesheet URL.')
  }
  if (cssUrl.origin !== page.origin) {
    throw new FetchError(403, 'cross-origin-css', 'Only same-origin stylesheets are fetched.')
  }

  const { response, url } = await follow(cssUrl.href, { allowPrivate })

  if (response.status < 200 || response.status >= 300) {
    response.body.destroy()
    throw new FetchError(502, 'http-error', `The stylesheet returned HTTP ${response.status}.`)
  }

  const contentType = response.headers['content-type'] ?? ''
  if (contentType && !/text\/css/i.test(contentType)) {
    response.body.destroy()
    throw new FetchError(415, 'not-css', 'That URL did not return CSS.')
  }

  const css = await readLimited(response.body, MAX_CSS_BYTES)
  if (new URL(url.href).origin !== page.origin) {
    throw new FetchError(403, 'cross-origin-css', 'The stylesheet redirected off the page origin.')
  }
  return { url: url.href, css }
}
