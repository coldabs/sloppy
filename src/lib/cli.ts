// The sloppy command line: copy and website scans for CI and
// scripts. It renders the same analysis the page shows — the JSON
// and SARIF outputs never change the score, they only format it —
// and it exits non-zero when a draft fails the gate, so a pipeline
// can block on slop the same way it blocks on a failing test.
//
// Exit codes:
//   0  the score met the threshold (default 70)
//   1  the score fell below the threshold — slop found at this gate
//   2  usage error, unreadable input, or a failed page fetch
//
// This module does the work; bin/sloppy.mjs is only the entry point
// that wires it to the real process streams and the built bundle, so
// the argument parsing, the formats, and the exit codes are all
// testable here without spawning a process.

import { readFile } from 'node:fs/promises'
import { fetchCss, fetchPage, FetchError } from '../../server/fetch.mjs'
import { analyze, type Analysis } from './analyzer'
import { copyToSarif, siteToSarif, type SarifLog } from './sarif'
import { analyzeSite, type SiteAnalysis, type SiteSource } from './siteAnalyzer'

export const DEFAULT_THRESHOLD = 70
export const MAX_STYLESHEETS = 5
// The largest copy draft the CLI will scan, in bytes — the same 8 MB
// cap the server puts on a fetched page (F5). A larger draft is
// refused rather than scanned: the windowed density loop used to be
// effectively quadratic, and an 8.9 MB draft never finished.
export const MAX_CLI_INPUT_BYTES = 8 * 1024 * 1024
// The version is injected at build time from package.json (F6):
// scripts/build-cli.mjs defines __SLOPPY_VERSION__ when it bundles
// this module. Outside a built bundle (tests) the identifier does
// not exist, and the typeof check below falls through safely —
// `typeof` on a missing global is 'undefined', never a throw — so
// there is no second hardcoded copy of the version to drift.
declare const __SLOPPY_VERSION__: string | undefined

export const USAGE = `sloppy — a local pattern checker for machine-made copy and websites.

Usage:
  sloppy [options] [file]       scan a text file (or pass no file to read stdin)
  sloppy --url <url>            scan a public website
  sloppy --stdin                read the draft from stdin
  cat draft.txt | sloppy        stdin is read when it is piped

Options:
  --file <path>                 text file to scan (same as the positional file)
  --url <url>                   public http(s) page to scan
  --stdin                       read the draft from stdin
  --format <json|sarif>         output format (default json)
  --sarif                       shorthand for --format sarif
  --threshold <0-100>           exit 1 when the score is below this (default 70)
  --help, -h                    show this help
  --version, -V                 print the version

Exit codes: 0 score met the threshold, 1 score below it, 2 usage, fetch error, or page not readable.

Examples:
  sloppy draft.txt
  sloppy --url https://example.com --format sarif > report.sarif
  sloppy --threshold 90 --sarif draft.txt`

export class CliError extends Error {}

export type CliInput =
  | { kind: 'file'; path: string }
  | { kind: 'stdin' }
  | { kind: 'url'; url: string }

export interface CliOptions {
  input: CliInput | null
  format: 'json' | 'sarif'
  threshold: number
  help: boolean
  version: boolean
}

// How a website scan gets its HTML and CSS. Tests inject a fake
// fetcher so the CLI's URL path can be exercised against a local
// server the real guard would (correctly) refuse.
export interface SiteFetcher {
  fetchPage: (url: string) => Promise<{ url: string; html: string }>
  fetchCss: (url: string) => Promise<{ css: string }>
}

// The default fetcher is the server's guarded fetch
// (server/fetch.mjs): DNS-pinned, private and loopback addresses
// blocked, redirects re-validated, 10 s timeout, 8 MB page cap —
// the same guard the Website panel uses. The CLI used to fetch
// URLs with a bare globalThis.fetch, which fetched loopback
// addresses with no guard at all (F1).
const toCliError = (caught: unknown, target: string): CliError => {
  if (caught instanceof FetchError) {
    return new CliError(`The page could not be fetched: ${caught.message}`)
  }
  return new CliError(`The page could not be fetched: ${target}.`)
}

export const guardedSiteFetcher: SiteFetcher = {
  fetchPage: async (url) => {
    try {
      const page = await fetchPage(url)
      return { url: page.url, html: page.html }
    } catch (caught) {
      throw toCliError(caught, url)
    }
  },
  fetchCss: async (url) => {
    const result = await fetchCss(url)
    return { css: result.css }
  },
}

// Streams and file access, injected so tests can drive the CLI
// without a process. The defaults are the real process streams.
export interface CliIo {
  readStdin: () => Promise<string>
  readFile: (path: string) => Promise<string>
  fetchSite: SiteFetcher
  stdinIsTTY: boolean
  writeOut: (text: string) => void
  writeErr: (text: string) => void
}

const readProcessStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

export const defaultIo = (): CliIo => ({
  readStdin: readProcessStdin,
  readFile: (path) => readFile(path, 'utf8'),
  fetchSite: guardedSiteFetcher,
  stdinIsTTY: process.stdin.isTTY ?? false,
  writeOut: (text) => process.stdout.write(text),
  writeErr: (text) => process.stderr.write(text),
})

const takeValue = (
  argv: readonly string[],
  index: number,
  flag: string,
): { value: string; next: number } => {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('-')) {
    throw new CliError(`${flag} needs a value.`)
  }
  return { value, next: index + 2 }
}

export const parseCliArgs = (argv: readonly string[]): CliOptions => {
  let file: string | null = null
  let url: string | null = null
  let stdin = false
  let format: 'json' | 'sarif' = 'json'
  let threshold = DEFAULT_THRESHOLD
  let help = false
  let version = false
  let endOfFlags = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!endOfFlags && arg === '--') {
      endOfFlags = true
      continue
    }
    if (!endOfFlags && arg.startsWith('--')) {
      // Split on the FIRST '=' only: the value keeps its own '='
      // characters, so --url=https://example.com/?page=1&utm=ai
      // survives intact. (arg.split('=', 2) discarded everything
      // after the second '='.)
      const eq = arg.indexOf('=')
      const flag = eq === -1 ? arg : arg.slice(0, eq)
      const inline = eq === -1 ? undefined : arg.slice(eq + 1)
      const valueOf = (name: string): string => {
        if (inline !== undefined) return inline
        const taken = takeValue(argv, i, name)
        i = taken.next - 1
        return taken.value
      }
      if (flag === '--help') help = true
      else if (flag === '--version') version = true
      else if (flag === '--stdin') stdin = true
      else if (flag === '--sarif') format = 'sarif'
      else if (flag === '--file') {
        if (file !== null) throw new CliError('Pass only one input file.')
        file = valueOf('--file')
      } else if (flag === '--url') {
        if (url !== null) throw new CliError('Pass only one URL.')
        url = valueOf('--url')
      } else if (flag === '--format') {
        const value = valueOf('--format')
        if (value !== 'json' && value !== 'sarif') {
          throw new CliError(`--format must be json or sarif, not ${value}.`)
        }
        format = value
      } else if (flag === '--threshold') {
        const raw = valueOf('--threshold')
        // Reject an empty value before Number(): Number('') === 0,
        // which used to pass validation and silently set the
        // threshold to 0, letting a failing file pass CI.
        if (raw.trim() === '') {
          throw new CliError('--threshold must be a number from 0 to 100.')
        }
        const value = Number(raw)
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          throw new CliError('--threshold must be a number from 0 to 100.')
        }
        threshold = value
      } else {
        throw new CliError(`Unknown option: ${flag}.`)
      }
      continue
    }
    if (!endOfFlags && (arg === '-h' || arg === '-V')) {
      if (arg === '-h') help = true
      else version = true
      continue
    }
    if (file !== null) throw new CliError('Pass only one input file.')
    file = arg
  }

  const inputs = [file !== null, url !== null, stdin].filter(Boolean).length
  if (inputs > 1) {
    throw new CliError('Pass one input: a file, --url, or --stdin.')
  }
  if (url !== null) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new CliError(`That is not a valid URL: ${url}.`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new CliError('Only http and https pages can be scanned.')
    }
  }

  return {
    input:
      url !== null
        ? { kind: 'url', url }
        : file !== null
          ? { kind: 'file', path: file }
          : stdin
            ? { kind: 'stdin' }
            : null,
    format,
    threshold,
    help,
    version,
  }
}

// The JSON report for a copy scan. The groups are left out on
// purpose: they carry the rule scan functions, which are not data.
export const copyJsonReport = (
  analysis: Analysis,
  input: string,
  toolVersion: string,
) => ({
  tool: 'sloppy',
  version: toolVersion,
  input,
  kind: 'copy',
  score: analysis.score,
  verdict: analysis.verdict,
  hits: analysis.hits,
  rulesHit: analysis.rulesHit,
  words: analysis.words,
  penalty: analysis.penalty,
  counts: analysis.counts,
  findings: analysis.findings.map((finding) => ({
    ruleId: finding.ruleId,
    label: finding.label,
    group: finding.group,
    severity: finding.severity,
    note: finding.note,
    fix: finding.fix,
    start: finding.start,
    end: finding.end,
    excerpt: finding.excerpt,
  })),
})

// The JSON report for a website scan. Structure and style hits are
// excerpts only — they have no offsets — while the copy findings
// carry the same offsets as a copy scan.
export const siteJsonReport = (site: SiteAnalysis, toolVersion: string) => {
  const groups = (list: SiteAnalysis['structure']) =>
    list.map((group) => ({
      ruleId: group.rule.id,
      label: group.rule.label,
      group: group.rule.group,
      severity: group.rule.severity,
      note: group.rule.note,
      fix: group.rule.fix,
      occurrences: group.occurrences,
      hits: group.hits.map((hit) => hit.excerpt),
    }))
  return {
    tool: 'sloppy',
    version: toolVersion,
    input: site.url,
    kind: 'site',
    score: site.score,
    verdict: site.verdict,
    title: site.title,
    description: site.description,
    hits: site.hits,
    rulesHit: site.rulesHit,
    penalty: site.penalty,
    counts: site.counts,
    stats: site.stats,
    textTruncated: site.textTruncated,
    structure: groups(site.structure),
    style: groups(site.style),
    copy: {
      score: site.copy.score,
      verdict: site.copy.verdict,
      hits: site.copy.hits,
      words: site.copy.words,
      findings: site.copy.findings.map((finding) => ({
        ruleId: finding.ruleId,
        label: finding.label,
        group: finding.group,
        severity: finding.severity,
        note: finding.note,
        fix: finding.fix,
        start: finding.start,
        end: finding.end,
        excerpt: finding.excerpt,
      })),
    },
  }
}

// Fetch a page the way the Website panel does: the HTML plus its
// linked stylesheets (at most five, in document order), so the site
// rules see the same CSS the browser scan would. The fetch goes
// through the server's SSRF guard (see guardedSiteFetcher): private
// and loopback addresses are refused, redirects are re-validated,
// and the page is capped at 8 MB. A stylesheet that fails to fetch
// is skipped, never fatal.
export const fetchSiteSource = async (
  target: string,
  fetcher: SiteFetcher,
): Promise<SiteSource> => {
  let page: { url: string; html: string }
  try {
    page = await fetcher.fetchPage(target)
  } catch (caught) {
    if (caught instanceof CliError) throw caught
    throw new CliError(`The page could not be fetched: ${target}.`)
  }
  const html = page.html
  const finalUrl = page.url
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const hrefs: string[] = []
  for (const link of doc.querySelectorAll('link[href]')) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
    if (!rel.includes('stylesheet')) continue
    try {
      const resolved = new URL(link.getAttribute('href') ?? '', finalUrl)
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue
      hrefs.push(resolved.href)
    } catch {
      // Ignore an unparseable href.
    }
  }
  const stylesheets = (
    await Promise.allSettled(
      [...new Set(hrefs)].slice(0, MAX_STYLESHEETS).map(async (href) => {
        const result = await fetcher.fetchCss(href)
        return result.css
      }),
    )
  ).flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : [],
  )
  return { url: finalUrl, html, stylesheets }
}

export const runCli = async (
  argv: readonly string[],
  io: CliIo = defaultIo(),
  opts: { version?: string } = {},
): Promise<number> => {
  const version =
    opts.version ??
    (typeof __SLOPPY_VERSION__ !== 'undefined' ? __SLOPPY_VERSION__ : 'unknown')
  let options: CliOptions
  try {
    options = parseCliArgs(argv)
  } catch (caught) {
    io.writeErr(
      `${caught instanceof Error ? caught.message : 'Bad arguments.'}\n\n${USAGE}\n`,
    )
    return 2
  }

  if (options.help) {
    io.writeOut(`${USAGE}\n`)
    return 0
  }
  if (options.version) {
    io.writeOut(`sloppy ${version}\n`)
    return 0
  }

  try {
    let score: number | null
    let output: string
    if (options.input?.kind === 'url') {
      const source = await fetchSiteSource(options.input.url, io.fetchSite)
      const site = analyzeSite(source)
      score = site.score
      output =
        options.format === 'sarif'
          ? JSON.stringify(siteToSarif(site, version), null, 2)
          : JSON.stringify(siteJsonReport(site, version), null, 2)
    } else {
      let text: string
      let inputName: string
      if (options.input?.kind === 'file') {
        try {
          text = await io.readFile(options.input.path)
        } catch {
          throw new CliError(`Cannot read ${options.input.path}.`)
        }
        inputName = options.input.path
      } else if (options.input?.kind === 'stdin' || !io.stdinIsTTY) {
        text = await io.readStdin()
        inputName = '-'
      } else {
        throw new CliError(
          'Nothing to scan. Pass a file, --url, or pipe text on stdin.',
        )
      }
      if (Buffer.byteLength(text, 'utf8') > MAX_CLI_INPUT_BYTES) {
        throw new CliError(
          `That draft is larger than ${MAX_CLI_INPUT_BYTES / 1024 / 1024} MB. Split it and scan the parts.`,
        )
      }
      const analysis = analyze(text)
      score = analysis.score
      output =
        options.format === 'sarif'
          ? JSON.stringify(
              copyToSarif(analysis, text, inputName, version) satisfies SarifLog,
              null,
              2,
            )
          : JSON.stringify(copyJsonReport(analysis, inputName, version), null, 2)
    }
    io.writeOut(`${output}\n`)
    // An unreadable page (F34) has no score: it is a failed scan,
    // not a failed gate, so it exits 2 like a fetch error.
    if (score === null) return 2
    return score >= options.threshold ? 0 : 1
  } catch (caught) {
    io.writeErr(
      `${caught instanceof Error ? caught.message : 'The scan failed.'}\n`,
    )
    return 2
  }
}
