import { handleFetchCss } from '../../server/handlers.mjs'
import { clientIpFromHeaders } from '../../server/rateLimit.mjs'

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
  const { status, payload } = await handleFetchCss(
    event.httpMethod,
    queryValue(event, 'url'),
    { ip: clientIpFromHeaders(event.headers) },
  )
  return send(status, payload)
}
