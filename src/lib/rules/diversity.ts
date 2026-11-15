// Diversity — how varied the writing is: sentence lengths, word choice, and how paragraphs open.

import {
  countWordsIn,
  isFormalSentence,
  paragraphSpans,
  sentenceIndexAt,
  sentenceSpans,
  severityWeight,
  stripFormalSentences,
  wordsIn,
  type RawMatch,
  type RuleDefinition,
} from './common'

// Burstiness: the standard deviation of sentence lengths divided by
// the mean. No published range was used: the ranges detector guides
// quote disagree with each other, and the largest direct measurement
// puts human academic writing at a mean CV of 0.449 (AI rewrites
// 0.376) across 60,779 paired texts (TextPulse Research 2026). On
// the P2 calibration corpus, clean human text of 80–200 words
// measures 0.17–0.35 — an academic abstract 0.23, a contract 0.17,
// API documentation 0.35, a varied 167-word news paragraph 0.34 —
// while a run of ten near-identical short sentences measures 0.08.
// The threshold below is calibrated from that corpus, not copied:
// under 0.12, with at least 10 sentences, at least 80 words, and a
// mean sentence under 26 words. Stage 4 widened the mean cap from 16
// to 26: the old cap missed the uniform 18–24-word GPT-4o/Claude
// cadence entirely, and a ten-sentence run at that length with
// almost no variance is the same flat rhythm, just longer sentences.
// The minimum run rose from 8 to 10 with it: eight sentences at mean
// 18 with near-zero variance also occur in clean filler (STRESS3 C22,
// eight PAD sentences at mean 17.8, CV 0.024, pinned clean), so a
// long-sentence run has to be sustained — ten sentences — before it
// counts. A nine-sentence uniform run at mean 20 still escapes; that
// is the documented cost of keeping C22 clean.
export const BURSTINESS_THRESHOLD = 0.12

export const BURSTINESS_MIN_SENTENCES = 10

export const BURSTINESS_MIN_WORDS = 80

export const BURSTINESS_MAX_MEAN_LENGTH = 26

export interface Burstiness {
  value: number
  sentences: number
  mean: number
}

export const burstinessOf = (text: string): Burstiness => {
  const lengths = sentenceSpans(text).map(
    (span) => countWordsIn(text.slice(span.start, span.end)),
  )
  const sentences = lengths.length
  if (sentences === 0) return { value: 1, sentences: 0, mean: 0 }
  const mean = lengths.reduce((sum, n) => sum + n, 0) / sentences
  if (mean === 0) return { value: 1, sentences, mean }
  const variance =
    lengths.reduce((sum, n) => sum + (n - mean) * (n - mean), 0) / sentences
  return { value: Math.sqrt(variance) / mean, sentences, mean }
}

// Moving-average type-token ratio (MATTR): the mean type-token
// ratio over every consecutive 100-word window, stepping one word at
// a time. Raw TTR falls as any text gets longer, which forced the
// old step-function bands (0.45 under 200 words, 0.40 under 500,
// 0.35 above) and their cliffs at 200/500 words — a draft one word
// either side of a cliff was judged by a different bar. MATTR is
// length-invariant by construction: each window is the same size,
// so a 2,000-word draft and a 150-word draft are measured on the
// same scale, and padding a repetitive passage with clean words
// cannot raise the average much, because the repetitive windows
// stay in the mean. The window is computed incrementally (one word
// leaves, one enters), so a 100,000-character draft stays linear.
// For texts shorter than the window, MATTR is the whole-text TTR:
// a single window. ttrOf below is kept as a helper (and for the
// P2 calibration tests); the low-ttr rule itself uses MATTR.
export const MATTR_WINDOW_WORDS = 100

// MATTR threshold — see the MATTR_THRESHOLD comment below.
export const mattrOf = (
  text: string,
  window = MATTR_WINDOW_WORDS,
): number => {
  const words = wordsIn(text)
  if (words.length === 0) return 1
  if (words.length <= window) {
    return new Set(words).size / words.length
  }
  const counts = new Map<string, number>()
  let distinct = 0
  const add = (word: string): void => {
    const next = (counts.get(word) ?? 0) + 1
    counts.set(word, next)
    if (next === 1) distinct += 1
  }
  const remove = (word: string): void => {
    const next = (counts.get(word) ?? 0) - 1
    if (next <= 0) {
      counts.delete(word)
      distinct -= 1
    } else {
      counts.set(word, next)
    }
  }
  for (let i = 0; i < window; i += 1) add(words[i])
  let total = distinct / window
  let windows = 1
  for (let i = window; i < words.length; i += 1) {
    remove(words[i - window])
    add(words[i])
    total += distinct / window
    windows += 1
  }
  return total / windows
}

// The old raw-TTR bands, retired by MATTR: kept exported so existing
// imports keep working, but the low-ttr rule no longer uses them.
export const ttrBandFor = (words: number): number =>
  words < 200 ? 0.45 : words < 500 ? 0.4 : 0.35

export const TTR_MIN_WORDS = 80

export const ttrOf = (text: string): number => {
  const words = wordsIn(text)
  if (words.length === 0) return 1
  return new Set(words).size / words.length
}

// Words that carry no content on their own. A bigram counts as
// repetition only when at least one of its words is not in this set:
// "of the" repeated ten times is grammar, "the team" repeated ten
// times is a narrow vocabulary.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with',
  'from', 'as', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'it', 'its', 'this', 'that', 'these', 'those', 'i',
  'you', 'he', 'she', 'we', 'they', 'his', 'her', 'our', 'their', 'my',
  'your', 'me', 'him', 'us', 'them', 'who', 'which', 'what', 'when',
  'where', 'how', 'why', 'not', 'no', 'if', 'then', 'than', 'so',
  'such', 'into', 'over', 'under', 'between', 'through', 'after',
  'before', 'during', 'up', 'down', 'out', 'about', 'more', 'most',
  'other', 'some', 'any', 'all', 'each', 'one', 'two', 'can', 'could',
  'will', 'would', 'should', 'may', 'might', 'must', 'shall', 'do',
  'does', 'did', 'have', 'has', 'had', 'am', 'an',
])

interface SentenceLength {
  start: number
  end: number
  words: number
  formal: boolean
}

const sentenceLengths = (text: string): SentenceLength[] =>
  sentenceSpans(text).map((span) => {
    const body = text.slice(span.start, span.end)
    return {
      ...span,
      words: countWordsIn(body),
      formal: isFormalSentence(body),
    }
  })

// The longest run of consecutive non-formal sentences whose lengths
// stay within maxSpread words of each other, at least minRun long.
// A run is broken by a formal sentence, a sentence under three
// words, or a length outside the run's spread — the same shape as
// same-length-sentences' runs, but the longest one, so the span
// locates the flat passage instead of the whole document (F25).
const longestLengthRun = (
  sentences: SentenceLength[],
  maxSpread: number,
  minRun: number,
): RawMatch | null => {
  let best: SentenceLength[] = []
  let run: SentenceLength[] = []
  let runMin = 0
  let runMax = 0
  const flush = () => {
    if (run.length >= minRun && run.length > best.length) best = run
    run = []
  }
  for (const sentence of sentences) {
    if (sentence.formal || sentence.words < 3) {
      flush()
      continue
    }
    if (run.length === 0) {
      run = [sentence]
      runMin = sentence.words
      runMax = sentence.words
      continue
    }
    const nextMin = Math.min(runMin, sentence.words)
    const nextMax = Math.max(runMax, sentence.words)
    if (nextMax - nextMin > maxSpread) {
      flush()
      run = [sentence]
      runMin = sentence.words
      runMax = sentence.words
      continue
    }
    run.push(sentence)
    runMin = nextMin
    runMax = nextMax
  }
  flush()
  return best.length === 0
    ? null
    : { start: best[0].start, end: best[best.length - 1].end }
}

// The longest run of consecutive non-formal sentences whose lengths
// strictly alternate between two values at least two words apart —
// 15, 21, 15, 21 — at least minRun long. A rigid alternation is a
// flat rhythm the CV misses: the two lengths average out, so the
// variance looks ordinary while the cadence is mechanical (F25).
// Clean human text on the P2 corpus measures CV 0.17–0.35 with
// varied lengths; an exact alternation sustained for ten sentences
// does not occur in it. The threshold is deliberately not lowered
// to catch it — widening it to 0.167 would flag clean text.
const longestAlternatingRun = (
  sentences: SentenceLength[],
  minRun: number,
): { start: number; end: number; gap: number; mean: number } | null => {
  interface Run {
    sentences: SentenceLength[]
    first: number
    second: number
  }
  // A holder, not a plain variable: the best run is assigned inside
  // the flush closure, and TypeScript narrows a closure-mutated
  // `Run | null` to `never` after the null check.
  const bestHolder: { run: Run | null } = { run: null }
  let run: SentenceLength[] = []
  // The two alternating values, in order; meaningful once the run
  // has two sentences.
  let first = 0
  let second = 0
  const flush = () => {
    if (
      run.length >= minRun &&
      (!bestHolder.run || run.length > bestHolder.run.sentences.length)
    ) {
      bestHolder.run = { sentences: run, first, second }
    }
    run = []
  }
  for (const sentence of sentences) {
    if (sentence.formal || sentence.words < 3) {
      flush()
      continue
    }
    if (run.length === 0) {
      run = [sentence]
      continue
    }
    if (run.length === 1) {
      const gap = Math.abs(sentence.words - run[0].words)
      if (gap < 2) {
        // Not an alternation — restart the run here.
        run = [sentence]
        continue
      }
      first = run[0].words
      second = sentence.words
      run.push(sentence)
      continue
    }
    const expected = run.length % 2 === 0 ? first : second
    if (sentence.words !== expected) {
      // The alternation breaks. The current sentence may start a new
      // run with the previous one.
      const prev = run[run.length - 1]
      const gap = Math.abs(sentence.words - prev.words)
      if (gap >= 2) {
        run = [prev, sentence]
        first = prev.words
        second = sentence.words
      } else {
        run = [sentence]
      }
      continue
    }
    run.push(sentence)
  }
  flush()
  const best = bestHolder.run
  if (!best) return null
  const gap = Math.abs(best.first - best.second)
  const mean =
    best.sentences.reduce((sum, s) => sum + s.words, 0) /
    best.sentences.length
  return {
    start: best.sentences[0].start,
    end: best.sentences[best.sentences.length - 1].end,
    gap,
    mean,
  }
}

// Burstiness and type-token ratio, shared by the scan and the
// penalty: the scan decides whether the signal fires, the penalty
// scales with how far past the threshold the measurement sits.
const burstinessScan = (text: string): RawMatch[] => {
  const clean = stripFormalSentences(text)
  const words = countWordsIn(clean)
  if (words < BURSTINESS_MIN_WORDS) return []
  const { value, sentences, mean } = burstinessOf(clean)
  if (
    sentences < BURSTINESS_MIN_SENTENCES ||
    mean >= BURSTINESS_MAX_MEAN_LENGTH
  ) {
    return []
  }
  const lengths = sentenceLengths(text)
  const matches: RawMatch[] = []
  // A flat rhythm: the CV fires, and the span is the longest run of
  // near-identical sentences — the flat passage — not the whole
  // document (F25). When the whole text is the run, the span is the
  // whole text, and that is correct: the signal is everywhere.
  if (value < BURSTINESS_THRESHOLD) {
    matches.push(
      longestLengthRun(lengths, 2, 4) ?? { start: 0, end: text.length },
    )
  }
  // A rigid alternation: two lengths repeating exactly. The CV
  // averages the pair out, so the alternation escapes the threshold
  // above — it is a pattern-detection gap, not a threshold gap, and
  // the threshold is not widened to catch it.
  const alternating = longestAlternatingRun(
    lengths,
    BURSTINESS_MIN_SENTENCES,
  )
  if (alternating) {
    const span = { start: alternating.start, end: alternating.end }
    if (
      !matches.some(
        (other) => span.start < other.end && other.start < span.end,
      )
    ) {
      matches.push(span)
    }
  }
  return matches
}

const burstinessPenalty = (
  _matches: RawMatch[],
  _words: number,
  text: string,
): number => {
  const { value } = burstinessOf(stripFormalSentences(text))
  const cvDepth = (BURSTINESS_THRESHOLD - value) / BURSTINESS_THRESHOLD
  // An exact alternation sustained for ten sentences is a maximally
  // flat rhythm: the pattern is either present (rigid) or absent,
  // so its depth is 1, the same as a perfectly uniform run. The
  // stronger of the two signals sets the penalty; they never stack.
  const alternating = longestAlternatingRun(
    sentenceLengths(text),
    BURSTINESS_MIN_SENTENCES,
  )
  const depth = Math.max(cvDepth, alternating ? 1 : 0)
  return severityWeight.low * 2.5 * Math.max(0, Math.min(1, depth))
}

// MATTR threshold for the low-ttr rule (Stage 4 calibration — see
// docs/METHOD.md and src/lib/stage4.test.ts): clean human text on
// the calibration corpus measures 0.65–0.86 (binding case the
// academic abstract at 0.685; the legal paragraph at 0.647 is
// formal-stripped before measuring, so it never reaches the rule),
// the repetitive probes 0.12–0.53 (binding case the repeated
// example draft at 0.530). The threshold sits in the gap, 0.085
// above the lowest clean case and 0.07 below the highest
// repetitive case — deliberately nearer the clean side, because
// this is a supporting signal and a false positive costs more than
// a missed repetition.
export const MATTR_THRESHOLD = 0.6

// The 100-word window with the lowest type-token ratio — the most
// repetitive passage (F25). Tokens in formal sentences are dropped,
// the way repeated-bigrams drops them, so the window is measured on
// the same words MATTR is. A text shorter than one window is a
// single window, so the span is the whole text.
const lowestMattrWindow = (text: string): RawMatch => {
  const spans = sentenceSpans(text)
  const formalSentences = new Set<number>()
  spans.forEach((span, index) => {
    if (isFormalSentence(text.slice(span.start, span.end))) {
      formalSentences.add(index)
    }
  })
  const tokens: Array<{ word: string; start: number; end: number }> = []
  for (const match of text.matchAll(/[\p{L}\p{N}'’]+/gu)) {
    const start = match.index ?? 0
    if (formalSentences.has(sentenceIndexAt(spans, start))) continue
    tokens.push({
      word: (match[0] ?? '').toLowerCase(),
      start,
      end: start + (match[0] ?? '').length,
    })
  }
  if (tokens.length <= MATTR_WINDOW_WORDS) {
    return { start: 0, end: text.length }
  }
  const counts = new Map<string, number>()
  let distinct = 0
  const add = (word: string): void => {
    const next = (counts.get(word) ?? 0) + 1
    counts.set(word, next)
    if (next === 1) distinct += 1
  }
  const remove = (word: string): void => {
    const next = (counts.get(word) ?? 0) - 1
    if (next <= 0) {
      counts.delete(word)
      distinct -= 1
    } else {
      counts.set(word, next)
    }
  }
  for (let i = 0; i < MATTR_WINDOW_WORDS; i += 1) add(tokens[i].word)
  let bestStart = 0
  let bestTtr = distinct / MATTR_WINDOW_WORDS
  for (let i = MATTR_WINDOW_WORDS; i < tokens.length; i += 1) {
    remove(tokens[i - MATTR_WINDOW_WORDS].word)
    add(tokens[i].word)
    const ttr = distinct / MATTR_WINDOW_WORDS
    if (ttr < bestTtr) {
      bestTtr = ttr
      bestStart = i - MATTR_WINDOW_WORDS + 1
    }
  }
  return {
    start: tokens[bestStart].start,
    end: tokens[bestStart + MATTR_WINDOW_WORDS - 1].end,
  }
}

const lowTtrScan = (text: string): RawMatch[] => {
  const clean = stripFormalSentences(text)
  const words = countWordsIn(clean)
  if (words < TTR_MIN_WORDS) return []
  return mattrOf(clean) < MATTR_THRESHOLD ? [lowestMattrWindow(text)] : []
}

const lowTtrPenalty = (
  _matches: RawMatch[],
  _words: number,
  text: string,
): number => {
  const clean = stripFormalSentences(text)
  const depth = (MATTR_THRESHOLD - mattrOf(clean)) / MATTR_THRESHOLD
  return severityWeight.low * 2.5 * Math.max(0, Math.min(1, depth))
}

// The same two-word pair, repeated. Both words being stopwords does
// not count — "of the" repeated is grammar — but a pair with a
// content word in it, repeated three or more times in a draft of at
// least 80 words, is a narrow vocabulary. Formal sentences are
// exempt per sentence: a contract repeats its defined terms on
// purpose, but one legal sentence does not exempt the rest of the
// draft. Tokens inside formal sentences are dropped, and pairs are
// never formed across a dropped sentence.
const repeatedBigrams = (text: string): RawMatch[] => {
  const spans = sentenceSpans(text)
  // Which sentences are formal is computed once per sentence, not
  // once per token: a 20,000-word single sentence would otherwise
  // re-test the whole sentence for every token.
  const formalSentences = new Set<number>()
  spans.forEach((span, index) => {
    if (isFormalSentence(text.slice(span.start, span.end))) {
      formalSentences.add(index)
    }
  })
  const tokens: Array<{
    word: string
    start: number
    end: number
    sentence: number
  }> = []
  for (const match of text.matchAll(/[\p{L}\p{N}'’]+/gu)) {
    const start = match.index ?? 0
    const sentence = sentenceIndexAt(spans, start)
    if (sentence < 0 || formalSentences.has(sentence)) continue
    tokens.push({
      word: (match[0] ?? '').toLowerCase(),
      start,
      end: start + (match[0] ?? '').length,
      sentence,
    })
  }
  if (tokens.length < TTR_MIN_WORDS) return []
  const counts = new Map<string, number>()
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if (tokens[i + 1].sentence - tokens[i].sentence > 1) continue
    const a = tokens[i].word
    const b = tokens[i + 1].word
    if (STOPWORDS.has(a) && STOPWORDS.has(b)) continue
    const key = `${a} ${b}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const repeated = new Set(
    [...counts.entries()].filter(([, n]) => n >= 3).map(([key]) => key),
  )
  if (repeated.size === 0) return []
  const matches: RawMatch[] = []
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if (tokens[i + 1].sentence - tokens[i].sentence > 1) continue
    const key = `${tokens[i].word} ${tokens[i + 1].word}`
    if (repeated.has(key)) {
      matches.push({ start: tokens[i].start, end: tokens[i + 1].end })
    }
  }
  return matches
}

// Paragraphs that open with a formal transition: furthermore,
// moreover, additionally, ultimately, and the rest. One is fine.
// When at least half of a piece's paragraphs open that way, the
// joins are doing the thinking. Needs at least three paragraphs.
// The threshold is inclusive: exactly half (two of four) fires,
// because the ratio is the same shape of pattern either side of
// the line.
const TRANSITION_OPENERS = new Set([
  'furthermore', 'moreover', 'additionally', 'ultimately',
  'consequently', 'therefore', 'however', 'meanwhile',
  'nevertheless', 'nonetheless', 'firstly', 'secondly', 'thirdly',
  'finally', 'overall', 'in conclusion', 'in summary', 'in addition',
])

const transitionStacking = (text: string): RawMatch[] => {
  const paragraphs = paragraphSpans(text).filter(
    (span) => countWordsIn(text.slice(span.start, span.end)) >= 3,
  )
  if (paragraphs.length < 3) return []
  const openers: RawMatch[] = []
  for (const paragraph of paragraphs) {
    const body = text.slice(paragraph.start, paragraph.end)
    const firstWords = wordsIn(body).slice(0, 2)
    const twoWord = firstWords.join(' ')
    const oneWord = firstWords[0] ?? ''
    if (TRANSITION_OPENERS.has(twoWord)) {
      const at = body.toLowerCase().indexOf(twoWord)
      openers.push({
        start: paragraph.start + at,
        end: paragraph.start + at + twoWord.length,
      })
    } else if (TRANSITION_OPENERS.has(oneWord)) {
      const at = body.toLowerCase().indexOf(oneWord)
      openers.push({
        start: paragraph.start + at,
        end: paragraph.start + at + oneWord.length,
      })
    }
  }
  return openers.length / paragraphs.length >= 0.5 ? openers : []
}

export const diversityRules: RuleDefinition[] = [
  {
    id: 'burstiness',
    label: 'Flat sentence rhythm',
    group: 'diversity',
    severity: 'low',
    note: 'Sentence after sentence landing at almost the same length: burstiness (standard deviation of sentence lengths divided by the mean) under 0.12, with at least 10 sentences, at least 80 words, and a mean sentence under 26 words. Legal text and technical documentation are exempt — their uniformity is the genre. The threshold is calibrated on the P2 corpus, where clean human text measures 0.17–0.35.',
    fix: 'Vary the lengths: shorten one sentence, lengthen another.',
    scan: burstinessScan,
    penaltyFor: burstinessPenalty,
  },
  {
    id: 'low-ttr',
    label: 'Narrow vocabulary range',
    group: 'diversity',
    severity: 'low',
    note: 'The text keeps reaching for the same words: moving-average type-token ratio (the mean type-token ratio over every consecutive 100-word window) below 0.60. A supporting signal only — it never decides a score on its own — and it does not fire under 80 words or in legal and technical text.',
    fix: 'Use the specific word for each thing instead of the same few words.',
    scan: lowTtrScan,
    penaltyFor: lowTtrPenalty,
  },
  {
    id: 'repeated-bigrams',
    label: 'Repeated word pairs',
    group: 'diversity',
    severity: 'low',
    note: 'The same two-word pair, with a content word in it, three or more times in a draft of at least 80 words. Pairs of pure stopwords (of the) do not count. Legal and technical text is exempt.',
    fix: 'Vary the phrasing, or cut the repetition.',
    scan: repeatedBigrams,
  },
  {
    id: 'transition-stacking',
    label: 'Transition stacking',
    group: 'diversity',
    severity: 'low',
    note: 'At least half of a piece’s paragraphs open with a formal transition word (furthermore, moreover, additionally, ultimately). Needs at least three paragraphs.',
    fix: 'Open paragraphs with the point, not the join.',
    scan: transitionStacking,
  },
]
