import { handleFetchPage } from '../server/handlers.mjs'
import { clientIpFromHeaders } from '../server/rateLimit.mjs'

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
  const { status, payload } = await handleFetchPage(
    request.method,
    queryValue(request, 'url'),
    { ip: clientIpFromHeaders(request.headers) },
  )
  send(response, status, payload)
}
