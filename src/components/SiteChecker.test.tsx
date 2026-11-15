// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pickFetchMode,
  proxyUrl,
  resolveBaseUrl,
} from '../lib/siteFetch'
import { SiteChecker } from './SiteChecker'

describe('proxyUrl', () => {
  it('passes the target through verbatim, query string and fragment included', () => {
    // corsfix reads the raw query string after `?` as the target and
    // does not percent-decode it: an encoded target is rejected with
    // `invalid_url` (verified live 2026-11-14), while the plain form
    // proxies fine and `?v=1.2&theme=dark` arrives at the target
    // intact. Encoding the target here would break every proxy scan.
    expect(proxyUrl('https://example.com/?v=1.2&theme=dark')).toBe(
      'https://proxy.corsfix.com/?https://example.com/?v=1.2&theme=dark',
    )
    expect(proxyUrl('https://example.com/page#section')).toBe(
      'https://proxy.corsfix.com/?https://example.com/page#section',
    )
    expect(proxyUrl('https://example.com/style.css?v=3')).toBe(
      'https://proxy.corsfix.com/?https://example.com/style.css?v=3',
    )
  })
})

describe('resolveBaseUrl', () => {
  const docFrom = (html: string) =>
    new DOMParser().parseFromString(html, 'text/html')

  it('returns the page URL when there is no base element', () => {
    const doc = docFrom('<html><head></head><body></body></html>')
    expect(resolveBaseUrl(doc, 'https://example.com/page')).toBe(
      'https://example.com/page',
    )
  })

  it('resolves a relative base href against the page URL', () => {
    const doc = docFrom(
      '<html><head><base href="/assets/"></head><body></body></html>',
    )
    expect(resolveBaseUrl(doc, 'https://example.com/page')).toBe(
      'https://example.com/assets/',
    )
  })

  it('resolves an absolute base href', () => {
    const doc = docFrom(
      '<html><head><base href="https://cdn.example.com/site/"></head><body></body></html>',
    )
    expect(resolveBaseUrl(doc, 'https://example.com/page')).toBe(
      'https://cdn.example.com/site/',
    )
  })

  it('falls back to the page URL on a malformed base href instead of throwing', () => {
    const doc = docFrom(
      '<html><head><base href="http://[invalid"></head><body></body></html>',
    )
    expect(() =>
      resolveBaseUrl(doc, 'https://example.com/page'),
    ).not.toThrow()
    expect(resolveBaseUrl(doc, 'https://example.com/page')).toBe(
      'https://example.com/page',
    )
  })

  it('falls back to the page URL on an empty base href', () => {
    const doc = docFrom('<html><head><base href="  "></head><body></body></html>')
    expect(resolveBaseUrl(doc, 'https://example.com/page')).toBe(
      'https://example.com/page',
    )
  })
})

describe('pickFetchMode', () => {
  it('prefers the API while it is healthy', () => {
    expect(pickFetchMode('ok', false, 'unknown')).toBe('api')
    expect(pickFetchMode('ok', false, 'granted')).toBe('api')
    expect(pickFetchMode('ok', false, 'denied')).toBe('api')
  })

  it('offers the proxy fallback after an API fetch failure', () => {
    // The lock-in bug: a health check that passed on mount used to
    // pin the API forever, so a later /api/fetch failure left the
    // user with no route at all. Now the proxy is offered instead.
    expect(pickFetchMode('ok', true, 'granted')).toBe('proxy')
    expect(pickFetchMode('ok', true, 'unknown')).toBe(null)
    expect(pickFetchMode('ok', true, 'denied')).toBe(null)
  })

  it('uses the proxy when there is no API and consent was granted', () => {
    expect(pickFetchMode('missing', false, 'granted')).toBe('proxy')
    expect(pickFetchMode('missing', true, 'granted')).toBe('proxy')
    expect(pickFetchMode('missing', false, 'unknown')).toBe(null)
    expect(pickFetchMode('missing', false, 'denied')).toBe(null)
  })

  it('offers nothing while the API state is still being checked', () => {
    expect(pickFetchMode('checking', false, 'unknown')).toBe(null)
    expect(pickFetchMode('checking', false, 'granted')).toBe('proxy')
  })
})

describe('SiteChecker API failure fallback', () => {
  let container: HTMLElement
  let root: Root

  const pageHtml =
    '<html><head><title>Example</title></head><body><h1>Hi</h1><p>Plain text.</p></body></html>'

  const renderChecker = async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(<SiteChecker /> as ReactElement)
    })
  }

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  const setInput = (value: string) => {
    const input = container.querySelector('#site-url') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set as (this: HTMLInputElement, value: string) => void
    setter.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  }

  const submitForm = async () => {
    const form = container.querySelector('.site-form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      )
    })
    await flush()
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/health') {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url.startsWith('/api/fetch')) {
          return new Response(JSON.stringify({ message: 'fetch failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url.startsWith('https://proxy.corsfix.com/?')) {
          return new Response(pageHtml, {
            status: 200,
            headers: { 'content-type': 'text/html' },
          })
        }
        return new Response('not found', { status: 404 })
      }),
    )
    window.localStorage.clear()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
  })

  it('offers the proxy fallback after /api/fetch fails, and the proxy scan then works', async () => {
    await renderChecker()
    await flush()
    expect(container.textContent).not.toContain('The fetch API failed')

    setInput('https://example.com/')
    await submitForm()

    // The API failed, so the fallback section appears instead of
    // leaving the user stuck on the dead route.
    expect(container.textContent).toContain('The fetch API failed')
    expect(container.textContent).toContain('Use the public proxy')

    // Granting the proxy and scanning again goes through the proxy
    // and completes the scan.
    const fallbackButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Use the public proxy',
    ) as HTMLButtonElement
    await act(async () => {
      fallbackButton.dispatchEvent(new window.Event('click', { bubbles: true }))
    })
    await flush()
    expect(container.textContent).toContain('live scans use the public proxy')

    setInput('https://example.com/')
    await submitForm()
    await flush()
    expect(container.textContent).toContain('Example')
  })
})
