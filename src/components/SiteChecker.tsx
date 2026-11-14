import { useRef, useState, type FormEvent } from 'react'
import { analyzeSite, type SiteAnalysis } from '../lib/siteAnalyzer'
import { SiteResultPanel, type SiteStatus } from './SiteResultPanel'

const MAX_STYLESHEETS = 5

const normaliseUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const responseError = async (response: Response) => {
  try {
    const body = (await response.json()) as { message?: unknown }
    if (typeof body.message === 'string') return body.message
  } catch {
    // The response was not JSON, likely a static host without the API.
  }
  if (response.status === 404) {
    return 'The local fetch server is not running. Start the app with npm run dev.'
  }
  return `The page could not be fetched (HTTP ${response.status}).`
}

const fetchStylesheets = async (
  pageUrl: string,
  html: string,
  signal: AbortSignal,
) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const page = new URL(pageUrl)
  const hrefs = new Set<string>()

  for (const link of doc.querySelectorAll('link[href]')) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
    if (!rel.includes('stylesheet')) continue
    try {
      const resolved = new URL(link.getAttribute('href') ?? '', page)
      if (resolved.origin !== page.origin) continue
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue
      hrefs.add(resolved.href)
    } catch {
      // Ignore an unparseable href.
    }
    if (hrefs.size >= MAX_STYLESHEETS) break
  }

  const results = await Promise.allSettled(
    [...hrefs].map(async (href) => {
      const query = `url=${encodeURIComponent(href)}&page=${encodeURIComponent(pageUrl)}`
      const response = await fetch(`/api/css?${query}`, { signal })
      if (!response.ok) throw new Error('Stylesheet skipped')
      const body = (await response.json()) as { css?: string }
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
  const request = useRef<AbortController | null>(null)

  const scan = async (target: string, demo = false) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller

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
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!htmlResponse.ok) {
          throw new Error('The bundled demo page is missing. Run npm run build first.')
        }
        html = await htmlResponse.text()

        const cssResponse = await fetch('/demo-site/styles.css', {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (cssResponse.ok) stylesheets = [await cssResponse.text()]
      } else {
        const response = await fetch(`/api/fetch?url=${encodeURIComponent(target)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(await responseError(response))
        const body = (await response.json()) as { url: string; html: string }
        pageUrl = body.url
        html = body.html
        stylesheets = await fetchStylesheets(pageUrl, html, controller.signal)
      }

      setStatus('analyzing')
      const result = analyzeSite({ url: pageUrl, html, stylesheets })
      setAnalysis(result)
      setTargetUrl(pageUrl)
      setStatus('done')
    } catch (caught) {
      if (controller.signal.aborted) return
      setStatus('error')
      setError(
        caught instanceof Error ? caught.message : 'The page could not be scanned.',
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

    void scan(target)
  }

  const busy = status === 'fetching' || status === 'analyzing'

  return (
    <div className="site-check">
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
          Scan the bundled demo site
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
