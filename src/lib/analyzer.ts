import { normalizeForScan } from './normalize'
import {
  rules,
  severityRank,
  severityWeight,
  type GroupId,
  type RuleDefinition,
  type Severity,
} from './rules'

export interface Finding {
  ruleId: string
  label: string
  group: GroupId
  severity: Severity
  note: string
  fix: string
  start: number
  end: number
  excerpt: string
}

export interface FindingGroup {
  rule: RuleDefinition
  hits: Finding[]
}

export interface SeverityCounts {
  high: number
  medium: number
  low: number
}

export interface Analysis {
  score: number
  verdict: string
  findings: Finding[]
  groups: FindingGroup[]
  counts: SeverityCounts
  hits: number
  rulesHit: number
  words: number
  penalty: number
}

const EXCERPT_PAD = 34
const MAX_HITS_RENDERED_PER_RULE = 40
export const SCORE_DECAY = 55

// Density scoring. A rule's contribution is its severity weight scaled
// by how often the pattern appears per 100 words, levelling off, so
// repeating one phrase costs more than saying it twice, but never
// without limit. Drafts under 50 words are scored as if they were 50
// words, so a single hit in a short note is not treated as if the
// whole draft were that one tell. At 100 words with one hit per rule
// the factor is close to 1, so the old scores for ordinary drafts
// barely move.
export const DENSITY_FLOOR_WORDS = 50
export const DENSITY_SATURATION = 10

export const densityFactor = (hits: number, words: number): number => {
  const effectiveWords = Math.max(words, DENSITY_FLOOR_WORDS)
  const per100 = (hits * 100) / effectiveWords
  return per100 / (1 + per100 / DENSITY_SATURATION)
}

export const verdictBands = [
  { min: 90, label: 'Clean enough' },
  { min: 70, label: 'Mostly clean' },
  { min: 45, label: 'Slop creeping in' },
  { min: 20, label: 'Heavy slop' },
  { min: 0, label: 'Industrial slop' },
] as const

export const verdictFor = (score: number): string =>
  verdictBands.find((band) => score >= band.min)?.label ?? 'Industrial slop'

export const scoreFromPenalty = (penalty: number): number =>
  penalty <= 0
    ? 100
    : Math.max(0, Math.min(100, Math.round(100 * Math.exp(-penalty / SCORE_DECAY))))

const buildExcerpt = (text: string, start: number, end: number) => {
  const from = Math.max(0, start - EXCERPT_PAD)
  const to = Math.min(text.length, end + EXCERPT_PAD)
  const body = text.slice(from, to).replace(/\s+/g, ' ').trim()
  return `${from > 0 ? '\u2026' : ''}${body}${to < text.length ? '\u2026' : ''}`
}

const countWords = (text: string) => {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export const analyze = (text: string): Analysis => {
  // Rules run on the normalised text, so lookalike letters, invisible
  // characters and swapped dashes cannot hide a phrase. Every finding
  // is mapped back to its span in the original text, so the highlighted
  // copy the user sees is exactly what they pasted.
  const { text: scanned, map } = normalizeForScan(text)
  const words = countWords(text)

  const findings: Finding[] = []
  const groupMap = new Map<string, FindingGroup>()
  const counts: SeverityCounts = { high: 0, medium: 0, low: 0 }
  let penalty = 0
  let hits = 0
  let rulesHit = 0

  for (const rule of rules) {
    const matches = rule.scan(scanned)
    if (matches.length === 0) continue

    rulesHit += 1
    hits += matches.length
    penalty +=
      severityWeight[rule.severity] * densityFactor(matches.length, words)
    counts[rule.severity] += matches.length

    const ruleFindings = matches.slice(0, MAX_HITS_RENDERED_PER_RULE).map((match) => {
      const start = map[match.start] ?? text.length
      const end = map[match.end] ?? text.length
      return {
        ruleId: rule.id,
        label: rule.label,
        group: rule.group,
        severity: rule.severity,
        note: rule.note,
        fix: rule.fix,
        start,
        end,
        excerpt: buildExcerpt(text, start, end),
      }
    })

    findings.push(...ruleFindings)
    groupMap.set(rule.id, { rule, hits: ruleFindings })
  }

  findings.sort(
    (a, b) => a.start - b.start || severityRank[a.severity] - severityRank[b.severity],
  )

  const groups = Array.from(groupMap.values()).sort(
    (a, b) =>
      severityRank[a.rule.severity] - severityRank[b.rule.severity] ||
      b.hits.length - a.hits.length ||
      a.rule.label.localeCompare(b.rule.label),
  )

  const score = scoreFromPenalty(penalty)

  return {
    score,
    verdict: verdictFor(score),
    findings,
    groups,
    counts,
    hits,
    rulesHit,
    words,
    penalty: Math.round(penalty * 100) / 100,
  }
}

export interface Segment {
  text: string
  severity: Severity | null
}

export const buildMarkedSegments = (text: string, findings: Finding[]): Segment[] => {
  if (findings.length === 0) return [{ text, severity: null }]

  const sorted = [...findings].sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: Array<{ start: number; end: number; severity: Severity }> = []

  for (const finding of sorted) {
    const last = merged[merged.length - 1]
    if (last && finding.start <= last.end) {
      last.end = Math.max(last.end, finding.end)
      if (severityRank[finding.severity] < severityRank[last.severity]) {
        last.severity = finding.severity
      }
      continue
    }
    merged.push({ start: finding.start, end: finding.end, severity: finding.severity })
  }

  const segments: Segment[] = []
  let cursor = 0
  for (const range of merged) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), severity: null })
    }
    segments.push({
      text: text.slice(range.start, range.end),
      severity: range.severity,
    })
    cursor = range.end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), severity: null })
  }

  return segments
}
