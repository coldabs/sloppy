// Substance — whether the text says anything concrete, or only sounds as if it does.

import {
  SENTENCE_START_WORDS,
  countWordsIn,
  matchPhrases,
  paragraphSpans,
  sentenceIndexAt,
  sentenceSpans,
  type RawMatch,
  type RuleDefinition,
} from './common'
import { unsourcedNumbers } from './claims'
import { TTR_MIN_WORDS } from './diversity'

export const PSEUDO_WISDOM_PHRASES = [
  'the key is to find balance',
  'true growth comes from within',
  'it\'s not about the destination, it\'s about the journey',
  'success is a journey, not a destination',
  'at the end of the day',
  'when it comes down to it',
  'the bottom line is',
  'remember to be kind to yourself',
  'believe in yourself',
  'anything is possible',
  'the sky is the limit',
  'dream big',
  'stay positive',
  'good things take time',
  'life is too short',
  'follow your dreams',
  'never give up',
  'live laugh love',
]

// Sentences that survive deletion with zero information loss. The
// delete test is a heuristic here: a fixed list of stock
// pseudo-profound sentences, counted per sentence. It fires only
// when at least a third of the sentences in a passage of at least
// three sentences are filler, and at least two sentences are filler
// — one platitude in a short note is not a pattern. The threshold is
// inclusive: exactly a third (two of six) fires, because the ratio is
// the same shape of pattern either side of the line.
const pseudoWisdom = (text: string): RawMatch[] => {
  const spans = sentenceSpans(text)
  if (spans.length < 3) return []
  const matches = matchPhrases(PSEUDO_WISDOM_PHRASES)(text)
  if (matches.length === 0) return []
  const fillerSentences = new Set<number>()
  for (const match of matches) {
    fillerSentences.add(sentenceIndexAt(spans, match.start))
  }
  return fillerSentences.size >= 2 &&
    fillerSentences.size / spans.length >= 1 / 3
    ? matches
    : []
}

// A paragraph is substantive when it carries at least one concrete
// fact: a number with context, or a cause tied to an outcome. A date
// alone is not a fact — "In January, everything changes" says nothing
// specific — and neither is a cause on its own: "because it helps
// teams" is a claim, not a fact. A number only counts when it is not
// an unsourced boast: "10,000 happy users" is the claim being
// checked, not evidence for the paragraph. A bare capitalised word
// is not a fact on its own (F24): any word can be capitalised
// mid-sentence — "Founders", "Seamless", "Next-Gen" — so a name only
// counts alongside a number or a cause, the way a cause already
// needs a number or a name in its sentence. Fires only when more
// than half of the paragraphs in a text of at least three paragraphs
// and 80 words fail the test.
const CAUSE_OR_TRADEOFF =
  /\b(?:because|since|due to|instead of|rather than|compared to|compared with|versus|trade-?off|in exchange for)\b/i

// Month and weekday names are dates, not names: "In January,
// everything changes" must not pass the name test, or a date alone
// would still count as substance.
const DATE_WORDS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday',
])

const paragraphHasConcreteFact = (
  paragraph: string,
  unsourced: RawMatch[],
  offset: number,
): boolean => {
  // A name: a capitalised word that is not the first word of a
  // sentence and not a word that is capitalised only because it
  // starts a sentence. Month and weekday names do not count.
  const hasName = (body: string): boolean => {
    const spans = sentenceSpans(body)
    for (const match of body.matchAll(/\b[A-Z][\p{L}]+/gu)) {
      const word = match[0]
      if (SENTENCE_START_WORDS.has(word)) continue
      if (DATE_WORDS.has(word.toLowerCase())) continue
      const pos = match.index ?? 0
      const sentence = spans[sentenceIndexAt(spans, pos)]
      if (!sentence) continue
      const before = body.slice(sentence.start, pos).trim()
      if (before === '') continue
      return true
    }
    return false
  }
  // A cause or trade-off only counts when it is tied to an outcome:
  // the same sentence has to carry a number or a name. "Because it
  // helps teams" is a claim; "because latency fell from 400ms to
  // 90ms" is a fact; "because Ana rewrote the queue" is a fact too,
  // because the name makes the cause concrete. A bare capitalised
  // word on its own is not a fact (F24) — it only counts here, as
  // the companion to a cause.
  const sentences = sentenceSpans(paragraph)
  for (const sentence of sentences) {
    const body = paragraph.slice(sentence.start, sentence.end)
    if (!CAUSE_OR_TRADEOFF.test(body)) continue
    if (/\d/.test(body) || hasName(body)) return true
  }
  // A number with context: any number that the unsourced-number rule
  // does not flag, except a bare four-digit year, which is a date.
  for (const match of paragraph.matchAll(/\b\d[\d,.]*\s?(?:%|\bpercent\b|\s?[kmb]\+?)?\b/gi)) {
    const raw = match[0].replace(/,/g, '')
    if (/^\d{4}$/.test(raw)) {
      const year = Number.parseInt(raw, 10)
      if (year >= 1900 && year <= 2099) continue
    }
    const start = offset + (match.index ?? 0)
    const end = start + match[0].length
    const flagged = unsourced.some(
      (span) => start >= span.start && end <= span.end,
    )
    if (!flagged) return true
  }
  return false
}

const thinSubstance = (text: string): RawMatch[] => {
  const words = countWordsIn(text)
  const paragraphs = paragraphSpans(text).filter(
    (span) => countWordsIn(text.slice(span.start, span.end)) >= 10,
  )
  if (paragraphs.length < 3 || words < TTR_MIN_WORDS) return []
  const unsourced = unsourcedNumbers(text)
  const failing = paragraphs.filter(
    (span) =>
      !paragraphHasConcreteFact(
        text.slice(span.start, span.end),
        unsourced,
        span.start,
      ),
  )
  return failing.length / paragraphs.length > 0.5 ? failing : []
}

export const substanceRules: RuleDefinition[] = [
  {
    id: 'thin-substance',
    label: 'Substance-poor paragraphs',
    group: 'substance',
    severity: 'medium',
    note: 'More than half of the paragraphs carry no concrete fact — no number with context, no cause tied to an outcome. A name on its own does not count: any word can be capitalised mid-sentence ("Founders", "Seamless"), so a bare capitalised word needs a number or a cause beside it. A date alone does not count, and neither does a cause on its own: "In January, everything changes" and "because it helps teams" say nothing specific. A bare boastful number does not count as a fact: 99.9% uptime is the claim being checked, not evidence. Needs at least three paragraphs of at least 10 words each, and 80 words in total.',
    fix: 'Give each paragraph one concrete thing: a name, a date, a sourced number, a cause.',
    scan: thinSubstance,
  },
  {
    id: 'pseudo-wisdom',
    label: 'Pseudo-wisdom filler',
    group: 'substance',
    severity: 'low',
    note: 'Sentences that sound profound and mean nothing — the key is to find balance, success is a journey — counted by the delete test: remove the sentence and the paragraph loses nothing. This is a heuristic approximation of that test, using a fixed list of stock sentences. It fires only when at least a third of the sentences in a passage of at least three sentences are filler, and at least two sentences are filler.',
    fix: 'Delete the sentence, or replace it with the specific thing that happened.',
    scan: pseudoWisdom,
  },
]
