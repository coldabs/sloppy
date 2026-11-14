import { FetchError, fetchPage } from '../../server/fetch.mjs'

const send = (statusCode, payload) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(payload),
})

const queryValue = (event, name) => {
  const value = event.queryStringParameters?.[name]
  if (typeof value === 'string') return value
  try {
    return new URL(event.rawUrl).searchParams.get(name) ?? ''
  } catch {
    return ''
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return send(405, { error: 'method-not-allowed', message: 'Use GET.' })
  }

  const target = queryValue(event, 'url')
  if (!target) {
    return send(400, { error: 'missing-url', message: 'Enter a page URL to scan.' })
  }
  if (target.length > 2048) {
    return send(414, { error: 'url-too-long', message: 'That URL is too long.' })
  }

  try {
    const page = await fetchPage(target, { allowPrivate: false })
    return send(200, page)
  } catch (error) {
    if (error instanceof FetchError) {
      return send(error.status, { error: error.code, message: error.message })
    }
    return send(502, {
      error: 'fetch-failed',
      message: 'The page could not be fetched.',
    })
  }
}
