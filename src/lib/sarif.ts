// GitHub Code Scanning SARIF 2.1.0 output for the CLI. The SARIF
// changes nothing about scoring: it is a second rendering of the
// same analysis the page shows, so a SARIF result and a JSON result
// for the same input always agree on score, verdict, and findings.

import type { Analysis, Finding } from './analyzer'
import { rules, type Severity } from './rules'
import type { SiteAnalysis } from './siteAnalyzer'
import { siteRules } from './siteRules'

export const SARIF_VERSION = '2.1.0'
export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json'

// SARIF levels are the only place severity is translated: high is an
// error, medium a warning, low a note. The names stay the same
// everywhere else.
export const sarifLevel = (severity: Severity): 'error' | 'warning' | 'note' =>
  severity === 'high' ? 'error' : severity === 'medium' ? 'warning' : 'note'

export interface SarifRule {
  id: string
  name: string
  shortDescription: { text: string }
  fullDescription: { text: string }
  help: { text: string }
  defaultConfiguration: { level: 'error' | 'warning' | 'note' }
  properties: { severity: Severity; group: string }
}

export interface SarifResult {
  ruleId: string
  level: 'error' | 'warning' | 'note'
  message: { text: string }
  locations?: Array<{
    physicalLocation: {
      artifactLocation: { uri: string }
      region?: {
        startLine: number
        startColumn: number
        endLine: number
        endColumn: number
        snippet: { text: string }
      }
    }
  }>
}

export interface SarifLog {
  $schema: string
  version: string
  runs: Array<{
    tool: {
      driver: {
        name: string
        version: string
        informationUri: string
        rules: SarifRule[]
      }
    }
    results: SarifResult[]
    // The score is null when the page was not readable (F34): no
    // numeric score is given for a page that was never read.
    properties: { score: number | null; verdict: string }
  }>
}

// 1-based line and column for an offset in the scanned text. A
// finding's region covers its exact span, so a code-scanning UI can
// point at the flagged words instead of the whole file.
export const lineColumn = (
  text: string,
  offset: number,
): { line: number; column: number } => {
  const clamped = Math.max(0, Math.min(offset, text.length))
  let line = 1
  let lineStart = 0
  for (let i = 0; i < clamped; i++) {
    if (text[i] === '\n') {
      line += 1
      lineStart = i + 1
    }
  }
  return { line, column: clamped - lineStart + 1 }
}

const copyRules = (): SarifRule[] =>
  rules.map((rule) => ({
    id: rule.id,
    name: rule.label,
    shortDescription: { text: rule.label },
    fullDescription: { text: rule.note },
    help: { text: rule.fix },
    defaultConfiguration: { level: sarifLevel(rule.severity) },
    properties: { severity: rule.severity, group: rule.group },
  }))

// Site rules live in a different rule set from the copy rules, so
// their ids are prefixed: a `site/dead-link` result is a page
// finding, never a copy finding.
const siteRuleId = (id: string) => `site/${id}`

const siteRulesMeta = (): SarifRule[] =>
  siteRules.map((rule) => ({
    id: siteRuleId(rule.id),
    name: rule.label,
    shortDescription: { text: rule.label },
    fullDescription: { text: rule.note },
    help: { text: rule.fix },
    defaultConfiguration: { level: sarifLevel(rule.severity) },
    properties: { severity: rule.severity, group: rule.group },
  }))

const copyResult = (finding: Finding, text: string, uri: string): SarifResult => {
  const start = lineColumn(text, finding.start)
  const end = lineColumn(text, finding.end)
  return {
    ruleId: finding.ruleId,
    level: sarifLevel(finding.severity),
    message: { text: `${finding.label}: ${finding.note} ${finding.excerpt}` },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri },
          region: {
            startLine: start.line,
            startColumn: start.column,
            endLine: end.line,
            endColumn: end.column,
            snippet: { text: finding.excerpt },
          },
        },
      },
    ],
  }
}

const buildSarif = (
  score: number | null,
  verdict: string,
  toolVersion: string,
  sarifRules: SarifRule[],
  results: SarifResult[],
): SarifLog => ({
  $schema: SARIF_SCHEMA,
  version: SARIF_VERSION,
  runs: [
    {
      tool: {
        driver: {
          name: 'sloppy',
          version: toolVersion,
          informationUri: 'https://github.com/coldabs/sloppy',
          rules: sarifRules,
        },
      },
      results,
      // The score is a run property, not a result: a gate reads one
      // number for the whole scan instead of counting findings.
      properties: { score, verdict },
    },
  ],
})

// SARIF for a copy scan. The uri names the scanned input: a file
// path for a file, "-" for stdin, so a result always says where the
// flagged text came from.
export const copyToSarif = (
  analysis: Analysis,
  text: string,
  uri: string,
  toolVersion: string,
): SarifLog =>
  buildSarif(
    analysis.score,
    analysis.verdict,
    toolVersion,
    copyRules(),
    analysis.findings.map((finding) => copyResult(finding, text, uri)),
  )

// SARIF for a website scan. Copy findings carry locations in the
// page text; structure and style findings have no offsets, so they
// carry the page URL as their location (F13) — without one, GitHub
// Code Scanning silently drops them from display — and the rule,
// the severity, and the occurrence count in the message.
export const siteToSarif = (
  site: SiteAnalysis,
  toolVersion: string,
): SarifLog => {
  const results: SarifResult[] = site.copy.findings.map((finding) =>
    copyResult(finding, site.copyText, site.url),
  )
  for (const group of [...site.structure, ...site.style]) {
    results.push({
      ruleId: siteRuleId(group.rule.id),
      level: sarifLevel(group.rule.severity),
      message: {
        text:
          `${group.rule.label}: ${group.rule.note} ` +
          `${group.hits[0]?.excerpt ?? ''} ` +
          `(${group.occurrences} ${group.occurrences === 1 ? 'occurrence' : 'occurrences'}).`,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: site.url },
          },
        },
      ],
    })
  }
  return buildSarif(
    site.score,
    site.verdict,
    toolVersion,
    [...copyRules(), ...siteRulesMeta()],
    results,
  )
}
