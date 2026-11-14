import { normalizeForScan } from './normalize'
import {
  rules,
  severityRank,
  severityWeight,
  type GroupId,
  type RawMatch,
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
  // True when the draft had no words at all. The score is 100 only
  // because there is nothing to score, and the verdict says so: an
  // empty draft is not "Clean enough".
  empty: boolean
}

const EXCERPT_PAD = 34
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

// Shared with the website checker: one penalty, one score, same curve.
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

  if (words === 0) {
    return {
      score: 100,
      verdict: 'Nothing to score',
      findings: [],
      groups: [],
      counts: { high: 0, medium: 0, low: 0 },
      hits: 0,
      rulesHit: 0,
      words: 0,
      penalty: 0,
      empty: true,
    }
  }

  // Every rule scans the same normalised text, so one span can be
  // matched by two rules: "in today's fast-paced world" is listed in
  // both the hype vocabulary and the template opener. The same span
  // counts once, at the worst severity — it is one piece of evidence,
  // not two. The same goes for a span that sits entirely inside
  // another: "99.9% uptime" is one claim, not a trust claim plus a
  // number. Structure rules span whole sentences, so they never take
  // part: a buzzword inside a same-length run is separate evidence,
  // and a same-length run is not hidden by a buzzword inside it. A
  // contained match is dropped only when the match containing it is
  // at least as severe; ties keep the rule that comes first in the
  // list, so the result is deterministic.
  const scannedMatches: Array<{
    rule: RuleDefinition
    start: number
    end: number
    order: number
  }> = []
  rules.forEach((rule, order) => {
    for (const match of rule.scan(scanned)) {
      scannedMatches.push({ rule, start: match.start, end: match.end, order })
    }
  })
  const ordered = [...scannedMatches].sort(
    (a, b) =>
      severityRank[a.rule.severity] - severityRank[b.rule.severity] ||
      a.order - b.order ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start,
  )
  const kept: typeof scannedMatches = []
  // A match can only be contained by a kept match that starts at or
  // before it and ends at or after it, so only kept matches starting
  // within one maximum span length of this match's end can contain
  // it. They are indexed by start position: scanning the whole kept
  // list for every match made a long draft quadratic (a 20k draft
  // with ~1,300 matches took ~48 ms; this keeps it at ~12 ms).
  const keptByStart = new Map<number, typeof scannedMatches>()
  let maxKeptLength = 0
  for (const item of ordered) {
    if (item.rule.group === 'structure') {
      kept.push(item)
      continue
    }
    const earliestStart = item.end - maxKeptLength
    let contained = false
    for (let s = item.start; s >= earliestStart && !contained; s--) {
      const atStart = keptByStart.get(s)
      if (!atStart) continue
      for (const other of atStart) {
        if (
          other.rule.group !== 'structure' &&
          severityRank[other.rule.severity] <= severityRank[item.rule.severity] &&
          item.end <= other.end
        ) {
          contained = true
          break
        }
      }
    }
    if (!contained) {
      kept.push(item)
      const list = keptByStart.get(item.start) ?? []
      list.push(item)
      keptByStart.set(item.start, list)
      const length = item.end - item.start
      if (length > maxKeptLength) maxKeptLength = length
    }
  }
  const matchesByRule = new Map<string, RawMatch[]>()
  for (const item of kept) {
    const list = matchesByRule.get(item.rule.id) ?? []
    list.push({ start: item.start, end: item.end })
    matchesByRule.set(item.rule.id, list)
  }

  const findings: Finding[] = []
  const groupMap = new Map<string, FindingGroup>()
  const counts: SeverityCounts = { high: 0, medium: 0, low: 0 }
  let penalty = 0
  let hits = 0
  let rulesHit = 0

  for (const rule of rules) {
    // Every hit is returned, not just the first forty per rule. A long
    // draft used to hide most of its findings; the panel now paginates
    // them instead, with an exact count of what is shown.
    const matches = (matchesByRule.get(rule.id) ?? []).sort(
      (a, b) => a.start - b.start,
    )
    if (matches.length === 0) continue

    rulesHit += 1
    hits += matches.length
    penalty +=
      severityWeight[rule.severity] * densityFactor(matches.length, words)
    counts[rule.severity] += matches.length

    const ruleFindings = matches.map((match) => {
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
    empty: false,
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
