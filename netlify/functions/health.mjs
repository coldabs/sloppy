import { handleHealth } from '../../server/handlers.mjs'

export const handler = async (event) => {
  const { status, payload } = handleHealth(event.httpMethod, 'netlify')
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(payload),
  }
}
