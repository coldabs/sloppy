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
import { analyze, type Analysis } from './analyzer'
import { copyToSarif, siteToSarif, type SarifLog } from './sarif'
import { analyzeSite, type SiteAnalysis, type SiteSource } from './siteAnalyzer'

export const DEFAULT_THRESHOLD = 70
export const MAX_STYLESHEETS = 5
// The CLI prints the version from package.json when it runs; this
// fallback is only for tests and for a bundle run without it.
export const CLI_VERSION_FALLBACK = '0.2.0'

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

Exit codes: 0 score met the threshold, 1 score below it, 2 usage or fetch error.

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

// Streams and file access, injected so tests can drive the CLI
// without a process. The defaults are the real process streams.
export interface CliIo {
  readStdin: () => Promise<string>
  readFile: (path: string) => Promise<string>
  fetch: (url: string) => Promise<Response>
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
  fetch: (url) => globalThis.fetch(url),
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
      const [flag, inline] = arg.split('=', 2)
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
        const value = Number(valueOf('--threshold'))
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
// rules see the same CSS the browser scan would. A stylesheet that
// fails to fetch is skipped, never fatal.
export const fetchSiteSource = async (
  target: string,
  fetchImpl: CliIo['fetch'],
): Promise<SiteSource> => {
  let response: Response
  try {
    response = await fetchImpl(target)
  } catch {
    throw new CliError(`The page could not be fetched: ${target}.`)
  }
  if (!response.ok) {
    throw new CliError(
      `The page could not be fetched (HTTP ${response.status}): ${target}.`,
    )
  }
  const html = await response.text()
  const finalUrl = response.url || target
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
        const cssResponse = await fetchImpl(href)
        if (!cssResponse.ok) throw new Error('Stylesheet skipped')
        return cssResponse.text()
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
  const version = opts.version ?? CLI_VERSION_FALLBACK
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
    let score: number
    let output: string
    if (options.input?.kind === 'url') {
      const source = await fetchSiteSource(options.input.url, io.fetch)
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
    return score >= options.threshold ? 0 : 1
  } catch (caught) {
    io.writeErr(
      `${caught instanceof Error ? caught.message : 'The scan failed.'}\n`,
    )
    return 2
  }
}
