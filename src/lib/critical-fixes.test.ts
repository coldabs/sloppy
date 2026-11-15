// @vitest-environment happy-dom
// Regression tests for the four Critical items fixed 2026-11-15
// (COMBINED_FIX_LIST.md F1, F2, F3, F34). Each test proves the fix
// from the failing side: the guard blocks, the worker is never
// asked for site work, an unread page gets no score.
import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyze } from './analyzer'
import {
  analyzeCopyAsync,
  analyzeSiteAsync,
  resetAnalysisWorker,
  setAnalysisWorkerFactory,
  WORKER_TIMEOUT_MS,
} from './analysisClient'
import { handleAnalysisRequest, type AnalysisRequest } from './analysisWorker'
import { guardedSiteFetcher, runCli, type CliIo } from './cli'
import { exampleDraft } from './exampleDraft'
import { siteToSarif } from './sarif'
import { analyzeSite, type SiteSource } from './siteAnalyzer'

describe('F1: CLI --url goes through the SSRF guard', () => {
  let server: Server
  let baseUrl: string

  const startServer = async () => {
    server = createServer((_req, res) => {
      res.setHeader('content-type', 'text/html')
      res.end(
        '<!doctype html><html><head><title>Local</title></head><body><h1>Local</h1><p>The quick brown fox jumps over the lazy dog.</p></body></html>',
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (typeof address !== 'object' || address === null) {
      throw new Error('The test server did not start.')
    }
    baseUrl = `http://127.0.0.1:${address.port}/`
  }

  afterEach(async () => {
    if (!server) return
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('refuses a loopback URL with a clear blocked-address error', async () => {
    // Port 80 is implied, so the address check fires: no server
    // needs to be listening — validation refuses before connecting.
    await expect(
      guardedSiteFetcher.fetchPage('http://127.0.0.1/'),
    ).rejects.toThrow(
      'Private, loopback, and local network addresses are blocked.',
    )
  })

  it('exits 2 from runCli on a loopback URL, naming the block', async () => {
    await startServer()
    let stderr = ''
    const io: CliIo = {
      readStdin: async () => '',
      readFile: async () => {
        throw new Error('no file')
      },
      fetchSite: guardedSiteFetcher,
      stdinIsTTY: true,
      writeOut: () => {},
      writeErr: (text) => {
        stderr += text
      },
    }
    const code = await runCli(['--url', baseUrl], io, { version: '0.2.0' })
    expect(code).toBe(2)
    // The test server listens on a random port, so the guard's
    // port check fires first; either message names the block.
    expect(stderr).toContain('Only ports 80 and 443 are allowed.')
  })
})

describe('F2: site analysis never reaches the worker', () => {
  afterEach(() => {
    resetAnalysisWorker()
    setAnalysisWorkerFactory(undefined)
  })

  const source: SiteSource = {
    url: 'https://example.com/',
    html: `<!doctype html><html><head><title>Probe</title></head><body>
      <h1>Probe</h1><p>${exampleDraft}</p>
    </body></html>`,
  }

  // A worker that records every request it gets.
  const countingWorker = () => {
    const seen: AnalysisRequest[] = []
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
      postMessage: (request: AnalysisRequest) => {
        seen.push(request)
        const response = handleAnalysisRequest(request)
        queueMicrotask(() => {
          worker.onmessage?.({ data: response } as MessageEvent)
        })
      },
      terminate: () => {},
    }
    return { worker, seen }
  }

  it('never posts a site request to the worker', async () => {
    const { worker, seen } = countingWorker()
    setAnalysisWorkerFactory(() => worker as unknown as Worker)
    const site = await analyzeSiteAsync(source)
    expect(site).toEqual(analyzeSite(source))
    expect(seen).toEqual([])
  })

  it('still succeeds when the worker would throw DOMParser is not defined', async () => {
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
      postMessage: () => {
        throw new ReferenceError('DOMParser is not defined')
      },
      terminate: () => {},
    }
    setAnalysisWorkerFactory(() => worker as unknown as Worker)
    await expect(analyzeSiteAsync(source)).resolves.toEqual(analyzeSite(source))
  })

  it('marks the worker broken after an error response, so the next scan does not retry it', async () => {
    let calls = 0
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
      postMessage: (request: AnalysisRequest) => {
        calls += 1
        queueMicrotask(() => {
          worker.onmessage?.({
            data: { id: request.id, ok: false, error: 'boom' },
          } as MessageEvent)
        })
      },
      terminate: () => {},
    }
    setAnalysisWorkerFactory(() => worker as unknown as Worker)
    await expect(analyzeCopyAsync(exampleDraft)).resolves.toEqual(
      analyze(exampleDraft),
    )
    expect(calls).toBe(1)
    // The fallback ran on the main thread; the next request must not
    // touch the worker again.
    await expect(analyzeCopyAsync(exampleDraft)).resolves.toEqual(
      analyze(exampleDraft),
    )
    expect(calls).toBe(1)
  })

  it('terminates a wedged worker on timeout and spawns a fresh one next time', async () => {
    vi.useFakeTimers()
    try {
      let created = 0
      const terminated: number[] = []
      const silentWorker = () => {
        created += 1
        const id = created
        return {
          onmessage: null as ((event: MessageEvent) => void) | null,
          onerror: null as ((event: ErrorEvent) => void) | null,
          postMessage: () => {
            // Never answers.
          },
          terminate: () => {
            terminated.push(id)
          },
        } as unknown as Worker
      }
      setAnalysisWorkerFactory(silentWorker)
      const first = analyzeCopyAsync(exampleDraft)
      await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT_MS + 1)
      await expect(first).resolves.toEqual(analyze(exampleDraft))
      expect(terminated).toHaveLength(1)
      // The next request spawns a fresh worker instead of reusing
      // the wedged one.
      const second = analyzeCopyAsync(exampleDraft)
      await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT_MS + 1)
      await expect(second).resolves.toEqual(analyze(exampleDraft))
      expect(created).toBe(2)
      expect(terminated).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('F34: an unread page gets no score', () => {
  const shell = `<!doctype html><html><head><title>App</title>
    <link rel="stylesheet" href="/app.css"></head><body>
    <div id="root"></div>
    <script type="module" src="/app.js"></script>
  </body></html>`

  it('returns a null score and "Page not readable" for an empty root shell', () => {
    const site = analyzeSite({
      url: 'https://example.com/',
      html: '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>',
    })
    expect(site.score).toBeNull()
    expect(site.verdict).toBe('Page not readable')
    expect(site.copy.words).toBe(0)
    expect(site.stats.links).toBe(0)
    expect(site.stats.headings).toBe(0)
  })

  it('returns a null score for the live-site-shaped shell (title, stylesheet, no copy)', () => {
    const site = analyzeSite({
      url: 'https://sloppyabs.netlify.app/',
      html: shell,
      stylesheets: ['.a{color:red}'],
    })
    expect(site.score).toBeNull()
    expect(site.verdict).toBe('Page not readable')
  })

  it('still scores a small page that has links or headings', () => {
    const site = analyzeSite({
      url: 'https://example.com/',
      html: `<!doctype html><html><head><title>Short</title></head><body>
        <h1>Short page</h1><p>The meeting moved to Thursday. Bring the draft and the signed form.</p>
        <a href="/more">More</a></body></html>`,
    })
    expect(site.score).not.toBeNull()
    expect(typeof site.score).toBe('number')
  })

  it('reports the page as unreadable from the CLI, with exit code 2', async () => {
    let stdout = ''
    const io: CliIo = {
      readStdin: async () => '',
      readFile: async () => {
        throw new Error('no file')
      },
      fetchSite: {
        fetchPage: async () => ({ url: 'https://example.com/', html: shell }),
        fetchCss: async () => ({ css: '' }),
      },
      stdinIsTTY: true,
      writeOut: (text) => {
        stdout += text
      },
      writeErr: () => {},
    }
    const code = await runCli(['--url', 'https://example.com/'], io, {
      version: '0.2.0',
    })
    expect(code).toBe(2)
    const report = JSON.parse(stdout)
    expect(report.kind).toBe('site')
    expect(report.score).toBeNull()
    expect(report.verdict).toBe('Page not readable')
  })

  it('carries a null score in SARIF for an unreadable page', () => {
    const site = analyzeSite({
      url: 'https://example.com/',
      html: '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>',
    })
    const sarif = siteToSarif(site, '0.2.0')
    expect(sarif.runs[0].properties.score).toBeNull()
    expect(sarif.runs[0].properties.verdict).toBe('Page not readable')
  })
})
