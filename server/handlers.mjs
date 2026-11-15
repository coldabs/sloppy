// The shared logic behind the fetch, css, and health endpoints
// (F14). The Vercel handlers (api/*.js) and the Netlify functions
// (netlify/functions/*.mjs) used to be near-duplicates of each
// other — same validation, same fetch call, same error mapping —
// differing only in the adapter layer (Vercel req/res vs Netlify
// event return) and in the health response's mode marker
// ('serverless' vs 'netlify', which is intentional per-platform
// labelling). They are thin adapters now; this module is the one
// place the behaviour lives. Each handler takes the method and the
// already-extracted target and returns a plain { status, payload }
// pair, so either platform can render it.
import { FetchError, fetchCss, fetchPage } from './fetch.mjs'

const methodNotAllowed = () => ({
  status: 405,
  payload: { error: 'method-not-allowed', message: 'Use GET.' },
})

export const handleFetchPage = async (method, target) => {
  if (method !== 'GET') return methodNotAllowed()
  if (!target) {
    return {
      status: 400,
      payload: { error: 'missing-url', message: 'Enter a page URL to scan.' },
    }
  }
  if (target.length > 2048) {
    return {
      status: 414,
      payload: { error: 'url-too-long', message: 'That URL is too long.' },
    }
  }
  try {
    const page = await fetchPage(target, { allowPrivate: false })
    return { status: 200, payload: page }
  } catch (error) {
    if (error instanceof FetchError) {
      return {
        status: error.status,
        payload: { error: error.code, message: error.message },
      }
    }
    return {
      status: 502,
      payload: { error: 'fetch-failed', message: 'The page could not be fetched.' },
    }
  }
}

export const handleFetchCss = async (method, target) => {
  if (method !== 'GET') return methodNotAllowed()
  if (!target || target.length > 4096) {
    return {
      status: 400,
      payload: { error: 'invalid-request', message: 'A stylesheet URL is required.' },
    }
  }
  try {
    const css = await fetchCss(target, { allowPrivate: false })
    return { status: 200, payload: css }
  } catch (error) {
    if (error instanceof FetchError && error.status === 403) {
      return {
        status: 403,
        payload: { error: error.code, message: error.message },
      }
    }
    // Stylesheets are optional enrichment. Never fail a page scan over one.
    return { status: 200, payload: { url: target, css: '' } }
  }
}

export const handleHealth = (method, mode) => {
  if (method !== 'GET') return methodNotAllowed()
  return { status: 200, payload: { ok: true, mode } }
}
