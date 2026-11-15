// @vitest-environment happy-dom
// Stage 6 — CLI (JSON + SARIF, exit codes), Web Worker offloading,
// and the SiteResultPanel "Plus N more" count (AUDIT.md §7 stage 6).
// A real browser Worker cannot run in vitest (node has no Worker
// global), so the client tests cover the message handler, the
// plumbing through a fake worker, and the main-thread fallback; the
// real worker is verified against the built app in headless Chromium
// (see the stage 6 report-back), not claimed from these tests.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, get, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { analyze } from './analyzer'
import {
  analyzeCopyAsync,
  analyzeSiteAsync,
  resetAnalysisWorker,
  setAnalysisWorkerFactory,
} from './analysisClient'
import {
  cloneableAnalysis,
  cloneableSiteAnalysis,
  handleAnalysisRequest,
  type AnalysisRequest,
} from './analysisWorker'
import { runCli, type CliIo } from './cli'
import { exampleDraft } from './exampleDraft'
import { copyToSarif, sarifLevel, siteToSarif } from './sarif'
import { analyzeSite, type SiteSource } from './siteAnalyzer'

const CLEAN_TEXT =
  'The meeting is on Tuesday. Bring the printed report and the signed form.'

// Node's fetch, via node:http: the happy-dom test environment
// replaces globalThis.fetch with a same-origin fetch that blocks
// the local test server, while the real CLI runs in node and uses
// undici fetch. This keeps the URL tests about the CLI, not about
// which fetch the test environment provides.
const nodeFetch: CliIo['fetch'] = (url) =>
  new Promise((resolve, reject) => {
    get(url, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk as Buffer))
      res.on('end', () => {
        resolve(
          new Response(Buffer.concat(chunks).toString('utf8'), {
            status: res.statusCode ?? 500,
            headers: {
              'content-type': res.headers['content-type'] ?? 'text/html',
            },
          }),
        )
      })
    }).on('error', reject)
  })

const slopAnalysis = () => analyze(exampleDraft)
const cleanAnalysis = () => analyze(CLEAN_TEXT)

// --- SARIF ---------------------------------------------------------------

describe('stage6: SARIF output', () => {
  it('maps severity to levels and carries score, rules, and locations for a slop draft', () => {
    expect(sarifLevel('high')).toBe('error')
    expect(sarifLevel('medium')).toBe('warning')
    expect(sarifLevel('low')).toBe('note')

    const analysis = slopAnalysis()
    const sarif = copyToSarif(analysis, exampleDraft, 'draft.txt', '0.2.0')

    expect(sarif.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json')
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs).toHaveLength(1)
    const run = sarif.runs[0]
    expect(run.tool.driver.name).toBe('sloppy')
    expect(run.tool.driver.version).toBe('0.2.0')
    expect(run.tool.driver.informationUri).toBe('https://github.com/coldabs/sloppy')
    // One rule per copy rule, each with a level.
    expect(run.tool.driver.rules).toHaveLength(28)
    for (const rule of run.tool.driver.rules) {
      expect(rule.id).toBeTruthy()
      expect(rule.shortDescription.text).toBeTruthy()
      expect(['error', 'warning', 'note']).toContain(rule.defaultConfiguration.level)
    }
    // One result per finding, with the severity mapping applied.
    expect(run.results).toHaveLength(analysis.findings.length)
    expect(run.results.map((result) => result.level).sort()).toContain('error')
    expect(run.results.map((result) => result.level).sort()).toContain('warning')
    expect(run.results.map((result) => result.level).sort()).toContain('note')
    analysis.findings.forEach((finding, index) => {
      const result = run.results[index]
      expect(result.ruleId).toBe(finding.ruleId)
      expect(result.level).toBe(sarifLevel(finding.severity))
      expect(result.message.text).toContain(finding.label)
      const region = result.locations?.[0].physicalLocation.region
      expect(region).toBeDefined()
      expect(result.locations?.[0].physicalLocation.artifactLocation.uri).toBe(
        'draft.txt',
      )
      // The draft is one line: the region is the finding's span.
      expect(region?.startLine).toBe(1)
      expect(region?.endLine).toBe(1)
      expect(region?.startColumn).toBe(finding.start + 1)
      expect(region?.endColumn).toBe(finding.end + 1)
      expect(region?.snippet.text).toBe(finding.excerpt)
    })
    // The score is a run property, not a result.
    expect(run.properties).toEqual({ score: analysis.score, verdict: analysis.verdict })
    expect(run.properties.score).toBeLessThan(70)
  })

  it('reports no results and a clean score for a clean draft', () => {
    const analysis = cleanAnalysis()
    expect(analysis.score).toBe(100)
    const sarif = copyToSarif(analysis, CLEAN_TEXT, '-', '0.2.0')
    expect(sarif.runs[0].results).toEqual([])
    expect(sarif.runs[0].properties).toEqual({
      score: 100,
      verdict: 'Clean enough',
    })
  })

  it('includes site rules and location-less site results for a website scan', () => {
    const html = `<!doctype html><html><head><title>Probe</title></head><body>
      <h1>Probe</h1>
      <p>${exampleDraft}</p>
      <a href="#">One</a><a href="#">Two</a>
    </body></html>`
    const site = analyzeSite({ url: 'https://example.com/', html })
    const sarif = siteToSarif(site, '0.2.0')
    const run = sarif.runs[0]
    // 28 copy rules + 21 site rules.
    expect(run.tool.driver.rules).toHaveLength(49)
    expect(run.properties.score).toBe(site.score)
    const siteResults = run.results.filter((result) =>
      result.ruleId.startsWith('site/'),
    )
    expect(siteResults.length).toBeGreaterThan(0)
    const deadLink = siteResults.find((result) => result.ruleId === 'site/dead-link')
    expect(deadLink).toBeDefined()
    expect(deadLink?.message.text).toContain('2 occurrences')
    expect(deadLink?.locations).toBeUndefined()
    // Copy findings carry locations in the page text.
    const copyResults = run.results.filter(
      (result) => !result.ruleId.startsWith('site/'),
    )
    expect(copyResults.length).toBe(site.copy.findings.length)
    for (const result of copyResults) {
      expect(result.locations?.[0].physicalLocation.artifactLocation.uri).toBe(
        'https://example.com/',
      )
    }
  })
})

// --- CLI -----------------------------------------------------------------

const makeIo = (opts: {
  files?: Record<string, string>
  stdin?: string
  stdinIsTTY?: boolean
  fetchImpl?: CliIo['fetch']
}): { io: CliIo; out: () => string; err: () => string } => {
  let stdout = ''
  let stderr = ''
  const io: CliIo = {
    readStdin: async () => opts.stdin ?? '',
    readFile: async (path) => {
      const value = opts.files?.[path]
      if (value === undefined) throw new Error(`Cannot read ${path}.`)
      return value
    },
    fetch: opts.fetchImpl ?? (async () => {
      throw new Error('fetch is not stubbed in this test')
    }),
    stdinIsTTY: opts.stdinIsTTY ?? true,
    writeOut: (text) => {
      stdout += text
    },
    writeErr: (text) => {
      stderr += text
    },
  }
  return { io, out: () => stdout, err: () => stderr }
}

describe('stage6: CLI JSON output and exit codes', () => {
  it('scores a slop file as JSON and exits 1', async () => {
    const { io, out } = makeIo({ files: { 'draft.txt': exampleDraft } })
    const code = await runCli(['draft.txt'], io, { version: '0.2.0' })
    expect(code).toBe(1)
    const report = JSON.parse(out())
    expect(report.tool).toBe('sloppy')
    expect(report.version).toBe('0.2.0')
    expect(report.input).toBe('draft.txt')
    expect(report.kind).toBe('copy')
    expect(report.score).toBe(slopAnalysis().score)
    expect(report.verdict).toBe(slopAnalysis().verdict)
    expect(report.hits).toBe(slopAnalysis().hits)
    expect(report.findings).toHaveLength(slopAnalysis().findings.length)
    expect(report.findings[0].ruleId).toBe(slopAnalysis().findings[0].ruleId)
  })

  it('scores a clean file as JSON and exits 0', async () => {
    const { io, out } = makeIo({ files: { 'clean.txt': CLEAN_TEXT } })
    const code = await runCli(['clean.txt'], io, { version: '0.2.0' })
    expect(code).toBe(0)
    const report = JSON.parse(out())
    expect(report.score).toBe(100)
    expect(report.verdict).toBe('Clean enough')
    expect(report.findings).toEqual([])
  })

  it('reads the same draft from stdin as from a file', async () => {
    const fromFile = makeIo({ files: { 'draft.txt': exampleDraft } })
    await runCli(['draft.txt'], fromFile.io, { version: '0.2.0' })
    const fromStdin = makeIo({ stdin: exampleDraft })
    const code = await runCli(['--stdin'], fromStdin.io, { version: '0.2.0' })
    expect(code).toBe(1)
    expect(JSON.parse(fromStdin.out())).toEqual({
      ...JSON.parse(fromFile.out()),
      input: '-',
    })
  })

  it('reads piped stdin with no arguments', async () => {
    const { io, out } = makeIo({ stdin: exampleDraft, stdinIsTTY: false })
    expect(await runCli([], io, { version: '0.2.0' })).toBe(1)
    expect(JSON.parse(out()).score).toBe(slopAnalysis().score)
  })

  it('exits 2 with no input on a TTY', async () => {
    const { io, err } = makeIo({ stdinIsTTY: true })
    expect(await runCli([], io, { version: '0.2.0' })).toBe(2)
    expect(err()).toContain('Nothing to scan')
  })

  it('exits 2 for a missing file, an unknown flag, and a bad threshold', async () => {
    const missing = makeIo({})
    expect(await runCli(['nope.txt'], missing.io, { version: '0.2.0' })).toBe(2)
    expect(missing.err()).toContain('Cannot read nope.txt')

    const badFlag = makeIo({})
    expect(await runCli(['--bogus'], badFlag.io, { version: '0.2.0' })).toBe(2)
    expect(badFlag.err()).toContain('Unknown option')

    const badThreshold = makeIo({ files: { 'draft.txt': exampleDraft } })
    expect(
      await runCli(['--threshold', '101', 'draft.txt'], badThreshold.io, {
        version: '0.2.0',
      }),
    ).toBe(2)

    const twoInputs = makeIo({ files: { 'draft.txt': exampleDraft } })
    expect(
      await runCli(['--url', 'https://example.com/', 'draft.txt'], twoInputs.io, {
        version: '0.2.0',
      }),
    ).toBe(2)
  })

  it('gates on the threshold: below fails, at the score passes', async () => {
    const score = slopAnalysis().score
    const low = makeIo({ files: { 'draft.txt': exampleDraft } })
    expect(
      await runCli(['--threshold', '0', 'draft.txt'], low.io, { version: '0.2.0' }),
    ).toBe(0)
    const high = makeIo({ files: { 'draft.txt': exampleDraft } })
    expect(
      await runCli(['--threshold', '100', 'draft.txt'], high.io, { version: '0.2.0' }),
    ).toBe(1)
    const exact = makeIo({ files: { 'draft.txt': exampleDraft } })
    expect(
      await runCli(['--threshold', String(score), 'draft.txt'], exact.io, {
        version: '0.2.0',
      }),
    ).toBe(0)
  })

  it('prints help and version and exits 0', async () => {
    const help = makeIo({})
    expect(await runCli(['--help'], help.io, { version: '0.2.0' })).toBe(0)
    expect(help.out()).toContain('Usage:')
    expect(help.out()).toContain('--threshold')

    const version = makeIo({})
    expect(await runCli(['--version'], version.io, { version: '0.2.0' })).toBe(0)
    expect(version.out()).toBe('sloppy 0.2.0\n')
  })

  it('outputs SARIF for a file when asked', async () => {
    const { io, out } = makeIo({ files: { 'draft.txt': exampleDraft } })
    expect(
      await runCli(['--sarif', 'draft.txt'], io, { version: '0.2.0' }),
    ).toBe(1)
    const sarif = JSON.parse(out())
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs[0].properties.score).toBe(slopAnalysis().score)
    expect(sarif.runs[0].results).toHaveLength(slopAnalysis().findings.length)
  })
})

describe('stage6: CLI website scan', () => {
  let server: Server
  let baseUrl: string

  const startServer = async () => {
    const html = `<!doctype html><html><head><title>Slop Shop</title>
      <link rel="stylesheet" href="/s.css"></head><body>
      <h1>Welcome</h1><p>${exampleDraft}</p>
      <a href="#">One</a><a href="#">Two</a>
    </body></html>`
    const css = `.x { border-radius: 9999px; }`
    server = createServer((req, res) => {
      if (req.url === '/s.css') {
        res.setHeader('content-type', 'text/css')
        res.end(css)
        return
      }
      res.setHeader('content-type', 'text/html')
      res.end(html)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (typeof address !== 'object' || address === null) {
      throw new Error('The test server did not start.')
    }
    baseUrl = `http://127.0.0.1:${address.port}/`
  }

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('scans a URL as JSON, with the stylesheet fetched', async () => {
    await startServer()
    const { io, out, err } = makeIo({ fetchImpl: nodeFetch })
    const code = await runCli(['--url', baseUrl], io, { version: '0.2.0' })
    expect(err()).toBe('')
    expect(code).toBe(1)
    const report = JSON.parse(out())
    expect(report.kind).toBe('site')
    expect(report.input).toBe(baseUrl)
    expect(report.title).toBe('Slop Shop')
    expect(report.score).toBeLessThan(70)
    expect(code).toBe(1)
    const deadLink = report.structure.find(
      (group: { ruleId: string }) => group.ruleId === 'dead-link',
    )
    expect(deadLink?.occurrences).toBe(2)
    expect(report.copy.findings.length).toBeGreaterThan(0)
  })

  it('scans a URL as SARIF', async () => {
    await startServer()
    const { io, out, err } = makeIo({ fetchImpl: nodeFetch })
    expect(
      await runCli(['--url', baseUrl, '--sarif'], io, { version: '0.2.0' }),
    ).toBe(1)
    expect(err()).toBe('')
    const sarif = JSON.parse(out())
    expect(sarif.version).toBe('2.1.0')
    expect(
      sarif.runs[0].results.some(
        (result: { ruleId: string }) => result.ruleId === 'site/dead-link',
      ),
    ).toBe(true)
  })

  it('exits 2 when the page cannot be fetched', async () => {
    await startServer()
    const { io, err } = makeIo({
      fetchImpl: async () => {
        throw new Error('network down')
      },
    })
    expect(await runCli(['--url', baseUrl], io, { version: '0.2.0' })).toBe(2)
    expect(err()).toContain('could not be fetched')
  })
})

// --- Worker ---------------------------------------------------------------

describe('stage6: worker message handler', () => {
  it('returns the same copy result as the main-thread analyser', () => {
    const request: AnalysisRequest = { id: 7, kind: 'copy', text: exampleDraft }
    const response = handleAnalysisRequest(request)
    expect(response).toEqual({
      id: 7,
      ok: true,
      kind: 'copy',
      result: cloneableAnalysis(analyze(exampleDraft)),
    })
    // A worker result must survive structured clone — the groups
    // carry rule functions on the main thread, and an unclonable
    // result would fail to post and fall back every time.
    expect(() => structuredClone(response)).not.toThrow()
    expect(
      handleAnalysisRequest({ id: 8, kind: 'copy', text: CLEAN_TEXT }),
    ).toEqual({ id: 8, ok: true, kind: 'copy', result: cloneableAnalysis(analyze(CLEAN_TEXT)) })
  })

  it('returns the same site result as the main-thread analyser', () => {
    const source: SiteSource = {
      url: 'https://example.com/',
      html: `<!doctype html><html><head><title>Probe</title></head><body>
        <h1>Probe</h1><p>${exampleDraft}</p><a href="#">One</a>
      </body></html>`,
    }
    const response = handleAnalysisRequest({ id: 9, kind: 'site', source })
    expect(response).toEqual({
      id: 9,
      ok: true,
      kind: 'site',
      result: cloneableSiteAnalysis(analyzeSite(source)),
    })
    expect(() => structuredClone(response)).not.toThrow()
  })

  it('reports an analysis error as a response instead of throwing', () => {
    const response = handleAnalysisRequest({
      id: 10,
      kind: 'copy',
      text: null as unknown as string,
    })
    expect(response).toEqual({
      id: 10,
      ok: false,
      error: expect.any(String),
    })
  })
})

describe('stage6: worker client', () => {
  afterEach(() => {
    resetAnalysisWorker()
    setAnalysisWorkerFactory(undefined)
  })

  // A stand-in for a real browser Worker: answers through the same
  // handler the real worker uses, on the next microtask.
  class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    postMessage = (request: AnalysisRequest) => {
      const response = handleAnalysisRequest(request)
      queueMicrotask(() => {
        this.onmessage?.({ data: response } as MessageEvent)
      })
    }
    terminate = () => {}
  }

  it('returns the worker result through the fake worker', async () => {
    setAnalysisWorkerFactory(() => new FakeWorker() as unknown as Worker)
    // The worker result is the cloneable form: same score, findings,
    // and rule labels, without the rule functions.
    await expect(analyzeCopyAsync(exampleDraft)).resolves.toEqual(
      cloneableAnalysis(analyze(exampleDraft)),
    )
    const source: SiteSource = {
      url: 'https://example.com/',
      html: `<!doctype html><html><head><title>Probe</title></head><body>
        <h1>Probe</h1><p>${exampleDraft}</p>
      </body></html>`,
    }
    const site = await analyzeSiteAsync(source)
    expect(site).toEqual(cloneableSiteAnalysis(analyzeSite(source)))
  })

  it('falls back to the main thread when the worker factory returns null', async () => {
    setAnalysisWorkerFactory(null)
    await expect(analyzeCopyAsync(exampleDraft)).resolves.toEqual(analyze(exampleDraft))
    const source: SiteSource = {
      url: 'https://example.com/',
      html: '<!doctype html><html><head><title>Probe</title></head><body><p>Plain text.</p></body></html>',
    }
    await expect(analyzeSiteAsync(source)).resolves.toEqual(analyzeSite(source))
  })

  it('falls back to the main thread when no Worker exists in this environment', async () => {
    // Node has no Worker global, so this is the no-Worker path.
    expect(typeof Worker).toBe('undefined')
    await expect(analyzeCopyAsync(exampleDraft)).resolves.toEqual(analyze(exampleDraft))
  })
})

// --- CLI binary ------------------------------------------------------------
// Spawns the real bin/sloppy.mjs against the built bundle. Skipped
// when the bundle has not been built (run `npm run build` first);
// the in-process runCli tests above cover the same behaviour.

const repoRoot = process.cwd()
const bundlePath = join(repoRoot, 'dist', 'cli', 'sloppy-lib.mjs')
const bundleExists = existsSync(bundlePath)

const spawnCli = (
  args: string[],
  input?: string,
): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve) => {
    const child = spawn('node', ['bin/sloppy.mjs', ...args], { cwd: repoRoot })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code) => {
      resolve({ code: code ?? 2, stdout, stderr })
    })
    // Spawning pipes stdin, so a no-argument run reads piped input
    // (possibly empty) instead of erroring for a TTY with no input.
    child.stdin.end(input ?? '')
  })

describe.skipIf(!bundleExists)('stage6: CLI binary end to end', () => {
  it('scores fixtures from files, stdin, and a URL, as JSON and SARIF', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sloppy-stage6-'))
    const slopPath = join(dir, 'slop.txt')
    const cleanPath = join(dir, 'clean.txt')
    await writeFile(slopPath, exampleDraft)
    await writeFile(cleanPath, CLEAN_TEXT)

    const slop = await spawnCli([slopPath])
    expect(slop.code).toBe(1)
    expect(JSON.parse(slop.stdout).score).toBe(slopAnalysis().score)

    const clean = await spawnCli([cleanPath])
    expect(clean.code).toBe(0)
    expect(JSON.parse(clean.stdout).score).toBe(100)

    const piped = await spawnCli([], exampleDraft)
    expect(piped.code).toBe(1)
    expect(JSON.parse(piped.stdout).score).toBe(slopAnalysis().score)

    const sarif = await spawnCli(['--sarif', slopPath])
    expect(sarif.code).toBe(1)
    const log = JSON.parse(sarif.stdout)
    expect(log.version).toBe('2.1.0')
    expect(log.runs[0].tool.driver.rules).toHaveLength(28)

    const missing = await spawnCli([join(dir, 'nope.txt')])
    expect(missing.code).toBe(2)
    expect(missing.stderr).toContain('Cannot read')

    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'text/html')
      res.end(
        `<!doctype html><html><head><title>Probe</title></head><body><p>${exampleDraft}</p></body></html>`,
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    try {
      const site = await spawnCli(['--url', `http://127.0.0.1:${port}/`])
      expect(site.code).toBe(1)
      const report = JSON.parse(site.stdout)
      expect(report.kind).toBe('site')
      expect(report.score).toBeLessThan(70)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    // Six process spawns, each importing the CLI bundle: slow on
    // this machine, so the default 5s test timeout is not enough.
  }, 30000)
})
