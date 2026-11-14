import { FetchError, fetchCss } from '../../server/fetch.mjs'

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
  if (!target || target.length > 4096) {
    return send(400, {
      error: 'invalid-request',
      message: 'A stylesheet URL is required.',
    })
  }

  try {
    const css = await fetchCss(target, { allowPrivate: false })
    return send(200, css)
  } catch (error) {
    if (error instanceof FetchError && error.status === 403) {
      return send(403, { error: error.code, message: error.message })
    }
    // Stylesheets are optional enrichment. Never fail a page scan over one.
    return send(200, { url: target, css: '' })
  }
}
