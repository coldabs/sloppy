import { FetchError, fetchCss } from '../server/fetch.mjs'

const send = (response, status, payload) => {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(payload))
}

const queryValue = (request, name) => {
  const value = request.query?.[name]
  if (Array.isArray(value)) return value[0] ?? ''
  if (typeof value === 'string') return value
  try {
    return new URL(request.url, 'http://localhost').searchParams.get(name) ?? ''
  } catch {
    return ''
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    send(response, 405, { error: 'method-not-allowed', message: 'Use GET.' })
    return
  }

  const target = queryValue(request, 'url')
  if (!target || target.length > 4096) {
    send(response, 400, {
      error: 'invalid-request',
      message: 'A stylesheet URL is required.',
    })
    return
  }

  try {
    const css = await fetchCss(target, { allowPrivate: false })
    send(response, 200, css)
  } catch (error) {
    if (error instanceof FetchError && error.status === 403) {
      send(response, 403, { error: error.code, message: error.message })
      return
    }
    // Stylesheets are optional enrichment. Never fail a page scan over one.
    send(response, 200, { url: target, css: '' })
  }
}
