import { FetchError, fetchPage } from '../server/fetch.mjs'

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
  if (!target) {
    send(response, 400, { error: 'missing-url', message: 'Enter a page URL to scan.' })
    return
  }
  if (target.length > 2048) {
    send(response, 414, { error: 'url-too-long', message: 'That URL is too long.' })
    return
  }

  try {
    const page = await fetchPage(target, { allowPrivate: false })
    send(response, 200, page)
  } catch (error) {
    if (error instanceof FetchError) {
      send(response, error.status, { error: error.code, message: error.message })
      return
    }
    send(response, 502, {
      error: 'fetch-failed',
      message: 'The page could not be fetched.',
    })
  }
}
