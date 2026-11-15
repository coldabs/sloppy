import { handleFetchPage } from '../../server/handlers.mjs'

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
  const { status, payload } = await handleFetchPage(
    event.httpMethod,
    queryValue(event, 'url'),
  )
  return send(status, payload)
}
