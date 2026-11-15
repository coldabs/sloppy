import { IconFlask } from '@tabler/icons-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { analyzeSiteAsync } from '../lib/analysisClient'
import type { SiteAnalysis } from '../lib/siteAnalyzer'
import {
  apiError,
  isTargetError,
  pickFetchMode,
  proxyUrl,
  resolveBaseUrl,
  type ApiState,
  type FetchMode,
  type ProxyConsent,
} from '../lib/siteFetch'
import { isPrivateHost, normaliseUrl } from '../lib/target'
import { SiteResultPanel, type SiteStatus } from './SiteResultPanel'

const MAX_STYLESHEETS = 5
const PROXY_STYLESHEETS = 3
const CONSENT_KEY = 'sloppy:proxy-consent'

const readConsent = (): ProxyConsent => {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : 'unknown'
  } catch {
    return 'unknown'
  }
}

const writeConsent = (value: ProxyConsent) => {
  try {
    window.localStorage.setItem(CONSENT_KEY, value)
  } catch {
    // Storage is optional; the choice still applies for this session.
  }
}

const responseError = async (response: Response): Promise<Error> => {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown }
    if (typeof body.message === 'string') {
      // Carry the server's error code (F43): the catch block tells a
      // target the API correctly refused from an endpoint that failed.
      return apiError(
        body.message,
        typeof body.error === 'string' ? body.error : undefined,
      )
    }
  } catch {
    // The response was not JSON, likely a static host without the API.
  }
  if (response.status === 404) {
    return apiError(
      'The fetch endpoint is not running. Start the app with npm run dev, or deploy the api/ routes.',
      'api-unavailable',
    )
  }
  return apiError(`The page could not be fetched (HTTP ${response.status}).`)
}

const parseJson = async <T,>(response: Response): Promise<T> => {
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw apiError(
      'The page fetch API is not available on this deployment. Run the app with npm run dev, or deploy the api/ routes so live scans can work.',
      'api-unavailable',
    )
  }
}

const fetchStylesheets = async (
  pageUrl: string,
  html: string,
  signal: AbortSignal,
  mode: FetchMode,
) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const page = new URL(pageUrl)
  const base = resolveBaseUrl(doc, pageUrl)
  const candidates: string[] = []

  for (const link of doc.querySelectorAll('link[href]')) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
    if (!rel.includes('stylesheet')) continue
    try {
      const resolved = new URL(link.getAttribute('href') ?? '', base)
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue
      candidates.push(resolved.href)
    } catch {
      // Ignore an unparseable href.
    }
  }

  const hrefs = [...new Set(candidates)]
  hrefs.sort(
    (a, b) =>
      Number(new URL(b).origin === page.origin) -
      Number(new URL(a).origin === page.origin),
  )

  const limit = mode === 'proxy' ? PROXY_STYLESHEETS : MAX_STYLESHEETS
  const results = await Promise.allSettled(
    hrefs.slice(0, limit).map(async (href) => {
      if (mode === 'proxy') {
        const response = await fetch(proxyUrl(href), { signal })
        if (!response.ok) throw new Error('Stylesheet skipped')
        const type = response.headers.get('content-type') ?? ''
        if (type && !/text\/css|text\/plain/i.test(type)) {
          throw new Error('Stylesheet skipped')
        }
        return response.text()
      }

      const response = await fetch(`/api/css?url=${encodeURIComponent(href)}`, {
        signal,
      })
      if (!response.ok) throw new Error('Stylesheet skipped')
      const body = await parseJson<{ css?: string }>(response)
      return body.css ?? ''
    }),
  )

  return results.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : [],
  )
}

export function SiteChecker() {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<SiteStatus>('idle')
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null)
  const [targetUrl, setTargetUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [apiState, setApiState] = useState<ApiState>('checking')
  const [apiFailed, setApiFailed] = useState(false)
  const [proxyConsent, setProxyConsent] = useState<ProxyConsent>(readConsent)
  const request = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/health', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('No health endpoint')
        const body = (await response.json()) as { ok?: boolean }
        if (!cancelled) setApiState(body.ok ? 'ok' : 'missing')
      })
      .catch(() => {
        if (!cancelled) setApiState('missing')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const grantProxy = () => {
    setProxyConsent('granted')
    writeConsent('granted')
    setError(null)
  }

  const denyProxy = () => {
    setProxyConsent('denied')
    writeConsent('denied')
    setError(null)
  }

  const retryApi = () => {
    setApiFailed(false)
    setError(null)
  }

  const scan = async (target: string, demo = false) => {
    const mode = demo ? null : pickFetchMode(apiState, apiFailed, proxyConsent)

    if (!demo && !mode) {
      setAnalysis(null)
      setStatus('error')
      setError(
        'Choose whether to use the public proxy above, or run the app locally.',
      )
      return
    }

    request.current?.abort()
    const controller = new AbortController()
    request.current = controller

    const timeoutSignal = AbortSignal.timeout(35000)
    const signal =
      typeof AbortSignal.any === 'function'
        ? AbortSignal.any([controller.signal, timeoutSignal])
        : controller.signal

    setError(null)
    setAnalysis(null)
    setTargetUrl(target)
    setStatus('fetching')

    try {
      let pageUrl: string
      let html: string
      let stylesheets: string[] = []

      if (demo) {
        pageUrl = new URL('/demo-site/', window.location.href).href
        const htmlResponse = await fetch('/demo-site/index.html', {
          signal,
          cache: 'no-store',
        })
        if (!htmlResponse.ok) {
          throw new Error('The bundled demo page is missing. Run npm run build first.')
        }
        html = await htmlResponse.text()

        const cssResponse = await fetch('/demo-site/styles.css', {
          signal,
          cache: 'no-store',
        })
        if (cssResponse.ok) stylesheets = [await cssResponse.text()]
      } else if (mode === 'proxy') {
        const parsed = new URL(target)
        if (isPrivateHost(parsed.hostname)) {
          throw new Error(
            'Local and private addresses cannot be scanned through the public proxy.',
          )
        }

        const response = await fetch(proxyUrl(target), {
          signal,
          cache: 'no-store',
        })
        if (!response.ok) {
          throw new Error(
            [403, 429].includes(response.status)
              ? `The public proxy could not fetch that page (HTTP ${response.status}). It may block automated requests, so try another public URL.`
              : `The public proxy returned HTTP ${response.status}.`,
          )
        }

        const type = response.headers.get('content-type') ?? ''
        if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) {
          throw new Error('That URL did not return an HTML page.')
        }

        // pageUrl stays the typed target (F41): the proxy follows
        // redirects server-side and returns the destination's HTML,
        // but it exposes no final URL — no header carries it, and
        // response.url is the proxy URL itself, not the target's.
        // Setting pageUrl from response.url would resolve every
        // relative stylesheet link against proxy.corsfix.com and
        // break stylesheet fetching for every proxy scan. A
        // cross-path redirect through the proxy therefore keeps the
        // origin path as its base; same-path redirects (http→https,
        // trailing slash) are unaffected.
        pageUrl = target
        html = await response.text()
        stylesheets = await fetchStylesheets(pageUrl, html, signal, 'proxy')
      } else {
        const response = await fetch(`/api/fetch?url=${encodeURIComponent(target)}`, {
          signal,
        })
        if (!response.ok) throw await responseError(response)
        const body = await parseJson<{ url: string; html: string }>(response)
        pageUrl = body.url
        html = body.html
        stylesheets = await fetchStylesheets(pageUrl, html, signal, 'api')
      }

      setStatus('analyzing')
      // Site analysis runs on the main thread: analyzeSite() needs
      // DOMParser, which a worker does not have, so sending it to
      // the worker only threw and fell back anyway (F2). Copy
      // analysis still runs in the worker.
      const result = await analyzeSiteAsync({ url: pageUrl, html, stylesheets })
      setAnalysis(result)
      setTargetUrl(pageUrl)
      setStatus('done')
    } catch (caught) {
      if (controller.signal.aborted) return
      // Only the endpoint's own failure marks the API as failed
      // (F43): a target the API correctly refused — a blocked
      // private address, a timeout, a non-HTML target — is not the
      // API failing, and must not push the user onto the proxy.
      // Gated on the error code, not the HTTP status: /api/fetch
      // maps target refusals to 502.
      if (mode === 'api' && !isTargetError(caught)) setApiFailed(true)
      setStatus('error')
      setError(
        caught instanceof DOMException && caught.name === 'TimeoutError'
          ? 'The fetch took too long. Try a smaller page or another URL.'
          : caught instanceof Error
            ? caught.message
            : 'The page could not be scanned.',
      )
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const target = normaliseUrl(url)

    if (!target) {
      setAnalysis(null)
      setStatus('error')
      setError('Enter a page URL first.')
      return
    }

    try {
      const parsed = new URL(target)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only http and https pages can be scanned.')
      }
    } catch (caught) {
      setAnalysis(null)
      setStatus('error')
      setError(
        caught instanceof TypeError
          ? 'That is not a valid URL.'
          : caught instanceof Error
            ? caught.message
            : 'That is not a valid URL.',
      )
      return
    }

    if ((apiState === 'missing' || apiFailed) && proxyConsent !== 'granted') {
      setAnalysis(null)
      setStatus('error')
      setError(
        apiFailed
          ? 'The fetch API failed. Choose whether to use the public proxy above, or try the API again.'
          : 'This static host has no fetch API. Choose whether to use the public proxy above, or run the app locally.',
      )
      return
    }

    void scan(target)
  }

  const busy = status === 'fetching' || status === 'analyzing'

  return (
    <div className="site-check">
      {apiState === 'missing' && proxyConsent === 'unknown' ? (
        <section className="proxy-consent" aria-labelledby="proxy-consent-title">
          <p className="eyebrow">Static host</p>
          <h3 id="proxy-consent-title">Live scans need a fetch route</h3>
          <p>
            This deployment has no server. Live scans can use a public CORS
            proxy operated by{' '}
            <a href="https://corsfix.com" target="_blank" rel="noreferrer noopener">
              corsfix.com
            </a>
            . The page URL is sent to that service. Run the app locally for
            private scans.
          </p>
          <div className="proxy-consent__actions">
            <button className="button button--primary" type="button" onClick={grantProxy}>
              Use the public proxy
            </button>
            <button className="text-button" type="button" onClick={denyProxy}>
              Not now
            </button>
          </div>
        </section>
      ) : apiState === 'missing' && proxyConsent === 'denied' ? (
        <p className="api-status" role="status">
          Live scanning needs the fetch API. Run the app with npm run dev, or
          deploy the api/ routes.
          <button className="text-button" type="button" onClick={grantProxy}>
            Use the proxy
          </button>
        </p>
      ) : apiState === 'missing' && proxyConsent === 'granted' ? (
        <p className="api-status api-status--proxy" role="status">
          Live scans use the public proxy at corsfix.com. The page URL is sent
          to that service.
          <button className="text-button" type="button" onClick={denyProxy}>
            Turn off
          </button>
        </p>
      ) : null}
      {apiFailed && proxyConsent !== 'granted' ? (
        <section className="proxy-consent" aria-labelledby="proxy-fallback-title">
          <h3 id="proxy-fallback-title">The fetch API failed</h3>
          <p>
            The server fetch did not work, so live scans can fall back to a
            public CORS proxy operated by{' '}
            <a href="https://corsfix.com" target="_blank" rel="noreferrer noopener">
              corsfix.com
            </a>
            . The page URL is sent to that service.
          </p>
          <div className="proxy-consent__actions">
            <button className="button button--primary" type="button" onClick={grantProxy}>
              Use the public proxy
            </button>
            <button className="text-button" type="button" onClick={retryApi}>
              Try the API again
            </button>
          </div>
        </section>
      ) : apiFailed && proxyConsent === 'granted' ? (
        <p className="api-status api-status--proxy" role="status">
          The fetch API failed, so live scans use the public proxy at
          corsfix.com. The page URL is sent to that service.
          <button className="text-button" type="button" onClick={retryApi}>
            Try the API again
          </button>
        </p>
      ) : null}
      <form className="site-form" onSubmit={submit}>
        <div className="site-form__field">
          <label className="field-label" htmlFor="site-url">
            Page URL
          </label>
          <input
            id="site-url"
            className="site-input"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck="false"
            placeholder="https://example.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-invalid={status === 'error'}
            aria-describedby="site-help"
          />
          <p className="field-hint" id="site-help">
            Public http or https pages only, on ports 80 and 443. Local and
            private addresses are blocked.
          </p>
        </div>
        <button className="button button--primary site-form__submit" type="submit" disabled={busy}>
          {busy ? 'Fetching' : 'Scan the site'}
        </button>
      </form>

      <div className="site-demo">
        <span className="site-demo__label">No URL handy?</span>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setUrl('')
            void scan('demo-site', true)
          }}
          disabled={busy}
        >
          <IconFlask size={14} stroke={2} aria-hidden="true" />
          <span>Scan the bundled demo site</span>
        </button>
        <span className="site-demo__note">
          A fixture page built to fail this checklist.
        </span>
      </div>

      {error ? (
        <p className="field-error" id="site-error">
          {error}
        </p>
      ) : null}

      <div className="site-output">
        <SiteResultPanel
          status={status}
          analysis={analysis}
          targetUrl={targetUrl}
          errorMessage={error}
        />
      </div>
    </div>
  )
}
