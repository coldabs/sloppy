import { handleHealth } from '../server/handlers.mjs'

const send = (response, status, payload) => {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(payload))
}

export default function handler(request, response) {
  const { status, payload } = handleHealth(request.method, 'serverless')
  send(response, status, payload)
}
