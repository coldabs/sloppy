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
  // Extra penalty from the sentence-level co-occurrence multiplier
  // (Stage 3): 0 when no sentence fired three or more distinct
  // phrase-rule groups.
  cooccurrenceBoost: number
  // True when the draft had no words at all. The score is 100 only
  // because there is nothing to score, and the verdict says so: an
  // empty draft is not "Clean enough".
  empty: boolean
  // True when the draft is too short to score (1 to MIN_SCORE_WORDS - 1
  // words). The score is still the computed number, so machine
  // consumers (the CLI threshold, the benchmark) keep working, but
  // the verdict says the number is not meaningful: a one-word draft
  // is not "Slop creeping in", it is too little evidence to judge.
  // The findings are still listed — the hit is real, the verdict is
  // about the score, not the hit.
  tooShort: boolean
}

const EXCERPT_PAD = 34
export const SCORE_DECAY = 55

// Rules whose spans cover whole sentences, paragraphs, or the whole
// draft are document-level evidence: they neither hide nor are hidden
// by the phrase rules, because a buzzword inside a flat-rhythm run
// is separate evidence from the rhythm itself.
const DOCUMENT_GROUPS = new Set<GroupId>([
  'structure',
  'diversity',
  'substance',
])

// Density scoring. A rule's contribution is its severity weight scaled
// by how often the pattern appears per 100 words, levelling off, so
// repeating one phrase costs more than saying it twice, but never
// without limit.
//
// A draft shorter than MIN_SCORE_WORDS is too little evidence to
// judge: the verdict is "Too short to score" and the score is not
// meaningful (F21). The old one-word verdict, "Slop creeping in" at
// 48, was indefensible UX — one listed word is not a sloppy draft.
export const MIN_SCORE_WORDS = 8

// The density is measured twice and blended: once over the whole
// draft, once over the worst 100-word sliding window (step 25 words),
// combined as 0.15 * global + 0.85 * peak. A sloppy hero followed by
// a thousand clean words still scores as slop, because the peak
// window holds the hero's density while the global term only softens
// it. A short draft is scored against an adaptive floor instead of a
// flat 50 words: the floor is the draft's own length, with a minimum
// of MIN_SCORE_WORDS and a cap of 50 — so an 8-word draft is judged
// as 8 words and a 21-word draft as 21, not as 46. The old floor
// (min(50, max(12, round(words * 2.2)))) inflated a 21-word draft
// to 46 words, so adding 20 clean words to one "seamless" moved the
// score from 48 to 75 and the hit all but disappeared (F21).
export const DENSITY_FLOOR_WORDS = 50
export const DENSITY_SATURATION = 10
export const WINDOW_WORDS = 100
export const WINDOW_STEP_WORDS = 25
export const WINDOW_GLOBAL_WEIGHT = 0.15
export const WINDOW_PEAK_WEIGHT = 0.85

export const adaptiveFloorWords = (words: number): number => {
  if (words <= 0) return 1
  return Math.min(
    DENSITY_FLOOR_WORDS,
    Math.max(MIN_SCORE_WORDS, words),
  )
}

export const densityFactor = (hits: number, words: number): number => {
  if (hits <= 0) return 0
  const effectiveWords = Math.max(words, adaptiveFloorWords(words))
  const per100 = (hits * 100) / effectiveWords
  return per100 / (1 + per100 / DENSITY_SATURATION)
}

export interface WordSpan {
  start: number
  end: number
}

// Word spans in the scanned text, so a rule match and the words around
// it share one coordinate system.
export const wordSpans = (text: string): WordSpan[] => {
  const spans: WordSpan[] = []
  for (const match of text.matchAll(/\S+/g)) {
    const start = match.index ?? 0
    spans.push({ start, end: start + match[0].length })
  }
  return spans
}

// The density of a rule's matches inside the worst 100-word window.
// Windows step by 25 words, and the final partial window is evaluated
// too: the loop runs while a window starts before the last word, so a
// tail shorter than the step is still a window. A match counts in
// every window it touches, including one it straddles — the peak is
// the worst window, not a partition, so a straddling match is never
// dropped for sitting on a boundary. The peak is always measured per
// 100 words, so a short tail window is scored conservatively, as one
// hit per 100 words rather than per its few words.
export const peakWindowDensityFactor = (
  matchOffsets: readonly RawMatch[],
  spans: readonly WordSpan[],
): number => {
  const totalWords = spans.length
  if (matchOffsets.length === 0 || totalWords === 0) return 0
  if (totalWords <= WINDOW_WORDS) {
    return densityFactor(matchOffsets.length, totalWords)
  }
  // Matches sorted by start and by end, so the number overlapping a
  // window is two binary searches instead of a scan of every match
  // per window: O((windows + matches) log matches) rather than
  // O(windows x matches), which was effectively quadratic on very
  // large inputs (F5). A match overlaps [winStart, winEnd) when it
  // starts before the window ends and ends after the window starts,
  // so the count is (#starts < winEnd) - (#ends <= winStart).
  const starts = matchOffsets.map((m) => m.start).sort((a, b) => a - b)
  const ends = matchOffsets.map((m) => m.end).sort((a, b) => a - b)
  const countLessThan = (sorted: readonly number[], value: number): number => {
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] < value) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const countAtMost = (sorted: readonly number[], value: number): number => {
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] <= value) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  let maxHitsInWindow = 0
  for (let i = 0; i < totalWords; i += WINDOW_STEP_WORDS) {
    const winStart = spans[i].start
    const winEnd = spans[Math.min(totalWords - 1, i + WINDOW_WORDS - 1)].end
    const hits =
      countLessThan(starts, winEnd) - countAtMost(ends, winStart)
    if (hits > maxHitsInWindow) maxHitsInWindow = hits
  }
  return densityFactor(maxHitsInWindow, WINDOW_WORDS)
}

// The blended density factor for one rule: the global density and the
// peak-window density, weighted 0.15 / 0.85. For drafts of 100 words
// or fewer the peak is the whole draft, so the blend is the global
// density unchanged.
export const blendedDensityFactor = (
  matchOffsets: readonly RawMatch[],
  spans: readonly WordSpan[],
  words: number,
): number =>
  WINDOW_GLOBAL_WEIGHT * densityFactor(matchOffsets.length, words) +
  WINDOW_PEAK_WEIGHT * peakWindowDensityFactor(matchOffsets, spans)

// Sentence-level co-occurrence. When three or more distinct
// phrase-rule groups fire in the same sentence, the signals are not
// independent evidence — a boastful number inside a hype sentence
// that also names a fake authority is one concentrated slop sentence,
// not three unrelated tells — so that sentence's share of the penalty
// is boosted by 25%. The factor is deliberately modest: it is a
// confidence boost on co-occurring evidence, not a new severity, and
// 1.25x keeps a single dense sentence from deciding a long draft on
// its own. Only phrase-level groups (voice, claims, actions, format)
// count: document-level rules span whole sentences or paragraphs, so
// they are not sentence-local evidence and neither trigger the boost
// nor contribute to it.
export const COOCCURRENCE_MIN_GROUPS = 3
export const COOCCURRENCE_MULTIPLIER = 1.25

interface SentenceSpan {
  start: number
  end: number
}

// Sentences, with offsets in the scanned text. A period only ends a
// sentence when whitespace or the end of the draft follows it, so
// "99.9%" and "v2.0" do not split a sentence. Newlines are boundaries
// too, so a heading or a list item is its own sentence. Table rows
// and fenced code blocks are skipped. This mirrors the splitter the
// rules themselves use, so a sentence here is a sentence there.
const sentenceSpans = (text: string): SentenceSpan[] => {
  const spans: SentenceSpan[] = []
  let inFence = false
  let offset = 0
  for (const line of text.split('\n')) {
    const lineStart = offset
    const lineEnd = offset + line.length
    offset = lineEnd + 1
    const trimmed = line.trim()
    const isFence = trimmed.startsWith('```')
    if (isFence || inFence || trimmed.startsWith('|')) {
      if (isFence) inFence = !inFence
      continue
    }
    let start = lineStart
    let i = 0
    while (i < line.length) {
      const ch = line[i]
      if (ch === '.' || ch === '!' || ch === '?') {
        const next = line[i + 1]
        if (next === undefined || next === ' ' || next === '\t') {
          const end = lineStart + i + 1
          if (end > start) spans.push({ start, end })
          start = end
          while (start < lineEnd && (text[start] === ' ' || text[start] === '\t')) {
            start += 1
          }
          i = start - lineStart
          continue
        }
      }
      i += 1
    }
    if (lineEnd > start) spans.push({ start, end: lineEnd })
  }
  return spans
}

// The co-occurrence boost for one analysis. Each phrase rule's penalty
// is apportioned across sentences by its share of that rule's hits —
// the blended penalty is not linear in hits, so this is an
// approximation, and it is documented as one — and a sentence that
// fires three or more distinct groups contributes an extra 25% of its
// apportioned share.
const cooccurrenceBoost = (
  phraseRules: ReadonlyArray<{
    rule: RuleDefinition
    penalty: number
    matches: RawMatch[]
  }>,
  scanned: string,
): number => {
  const sentences = sentenceSpans(scanned)
  if (sentences.length === 0 || phraseRules.length === 0) return 0
  const flat = phraseRules
    .flatMap(({ rule, matches }) =>
      matches.map((match) => ({ ruleId: rule.id, group: rule.group, start: match.start })),
    )
    .sort((a, b) => a.start - b.start)
  if (flat.length === 0) return 0
  // A match belongs to the sentence containing its start; a match
  // starting in the gap between sentences belongs to the next one.
  const groupsBySentence = sentences.map(() => new Set<GroupId>())
  const sentenceOf = new Map<number, number>()
  let s = 0
  flat.forEach((match, index) => {
    while (s < sentences.length - 1 && match.start >= sentences[s].end) s += 1
    groupsBySentence[s].add(match.group)
    sentenceOf.set(index, s)
  })
  const boosted = groupsBySentence.map((groups) => groups.size >= COOCCURRENCE_MIN_GROUPS)
  if (!boosted.some(Boolean)) return 0
  let extra = 0
  for (const { rule, penalty, matches } of phraseRules) {
    if (matches.length === 0 || penalty <= 0) continue
    let boostedHits = 0
    flat.forEach((match, index) => {
      if (match.ruleId === rule.id && boosted[sentenceOf.get(index) ?? 0]) boostedHits += 1
    })
    extra += (COOCCURRENCE_MULTIPLIER - 1) * penalty * (boostedHits / matches.length)
  }
  return extra
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

// Fenced code blocks (```...``` or ~~~...~~~) and inline code spans
// (`...`) are not prose: a listed word inside them is code, not a
// claim (F23). They are blanked — every character except a line break
// replaced with a space, same length — before the rules scan, so rule
// offsets and the normaliser's offset map stay aligned and no finding
// can start or end inside code. Newlines are kept, so the blanked
// block still breaks paragraphs and sentences the way the fence did.
// A fence opens at a line start (up to three leading spaces) and
// closes on a line of the same character, at least as long, with no
// info string; an unclosed fence runs to the end of the text. An
// inline span is a run of backticks closed by the same run.
export const blankCodeSpans = (text: string): string => {
  const chars = text.split('')
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to; i += 1) {
      if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '
    }
  }
  const lines: Array<{ start: number; end: number }> = []
  let pos = 0
  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos)
    const end = nl === -1 ? text.length : nl
    lines.push({ start: pos, end })
    if (nl === -1) break
    pos = nl + 1
  }
  let i = 0
  while (i < lines.length) {
    const line = text.slice(lines[i].start, lines[i].end)
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (!open) {
      i += 1
      continue
    }
    const marker = open[1][0]
    const length = open[1].length
    const close = new RegExp(`^ {0,3}${marker}{${length},}\\s*$`)
    let j = i + 1
    while (j < lines.length) {
      if (close.test(text.slice(lines[j].start, lines[j].end))) break
      j += 1
    }
    const endLine = j < lines.length ? j : lines.length - 1
    blank(lines[i].start, lines[endLine].end)
    i = endLine + 1
  }
  const blanked = chars.join('')
  return blanked.replace(/(`+)([\s\S]*?)\1/g, (match) =>
    match.replace(/[^\n\r]/g, ' '),
  )
}

export const analyze = (text: string): Analysis => {
  // Rules run on the normalised text, so lookalike letters, invisible
  // characters and swapped dashes cannot hide a phrase. Every finding
  // is mapped back to its span in the original text, so the highlighted
  // copy the user sees is exactly what they pasted.
  const { text: normalized, map } = normalizeForScan(text)
  const totalWords = countWords(text)

  if (totalWords === 0) {
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
      cooccurrenceBoost: 0,
      empty: true,
      tooShort: false,
    }
  }

  // Code is not prose (F23): fenced blocks and inline spans are
  // blanked before the rules scan, and the word count below is the
  // prose word count — the density is per prose word, not per code
  // word. A draft that is only code has no prose to score.
  const scanned = blankCodeSpans(normalized)
  const words = countWords(scanned)

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
      cooccurrenceBoost: 0,
      empty: false,
      tooShort: false,
    }
  }

  // Every rule scans the same normalised text, so one span can be
  // matched by two rules: "in today's fast-paced world" is listed in
  // both the hype vocabulary and the template opener. The same span
  // counts once, at the worst severity — it is one piece of evidence,
  // not two. The same goes for a span that sits entirely inside
  // another: "99.9% uptime" is one claim, not a trust claim plus a
  // number. Document-level rules (structure, diversity, substance)
  // span whole sentences, paragraphs, or the whole draft, so they
  // never take part: a buzzword inside a same-length run is separate
  // evidence, and a same-length run is not hidden by a buzzword
  // inside it. A
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
    if (DOCUMENT_GROUPS.has(item.rule.group)) {
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
          !DOCUMENT_GROUPS.has(other.rule.group) &&
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
  // Word spans in the scanned text, shared by the windowed density
  // and the sentence-level co-occurrence boost below.
  const spans = wordSpans(scanned)
  // Phrase-rule penalties, for the co-occurrence boost: only rules
  // without their own penaltyFor in a non-document group take part.
  const phraseRules: Array<{
    rule: RuleDefinition
    penalty: number
    matches: RawMatch[]
  }> = []

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
    // Document-level rules (burstiness, type-token ratio) compute
    // their own penalty from the measured value; every other rule
    // uses severity weight times the blended density factor — the
    // global density and the worst 100-word window, 0.15 / 0.85 —
    // so a sloppy passage cannot be washed out by clean filler.
    const rulePenalty = rule.penaltyFor
      ? rule.penaltyFor(matches, words, scanned)
      : severityWeight[rule.severity] *
        blendedDensityFactor(matches, spans, words)
    penalty += rulePenalty
    if (!rule.penaltyFor && !DOCUMENT_GROUPS.has(rule.group)) {
      phraseRules.push({ rule, penalty: rulePenalty, matches })
    }
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

    // Pushed one at a time, not spread: spreading a very long
    // draft's findings into push() overflows the call stack (F5).
    for (const finding of ruleFindings) findings.push(finding)
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

  // A sentence where three or more distinct phrase-rule groups fire
  // carries an extra 25% of its apportioned penalty share.
  const boost = cooccurrenceBoost(phraseRules, scanned)
  penalty += boost

  const score = scoreFromPenalty(penalty)
  const tooShort = words > 0 && words < MIN_SCORE_WORDS

  return {
    score,
    verdict: tooShort ? 'Too short to score' : verdictFor(score),
    findings,
    groups,
    counts,
    hits,
    rulesHit,
    words,
    penalty: Math.round(penalty * 100) / 100,
    cooccurrenceBoost: Math.round(boost * 100) / 100,
    empty: false,
    tooShort,
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
