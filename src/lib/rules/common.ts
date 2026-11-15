// Shared types, phrase matching, sentence/paragraph spans, and the

// formal-register exemption. Every group module imports from here;

// nothing here imports from any group module, so there are no cycles.

export type Severity = 'high' | 'medium' | 'low'

export type GroupId =
  | 'voice'
  | 'claims'
  | 'actions'
  | 'format'
  | 'structure'
  | 'diversity'
  | 'substance'

export interface RawMatch {
  start: number
  end: number
}

export interface RuleDefinition {
  id: string
  label: string
  group: GroupId
  severity: Severity
  note: string
  fix: string
  scan: (text: string) => RawMatch[]
  // Document-level rules (burstiness, type-token ratio) cannot be
  // scored by hit count: one whole-text span would cost almost
  // nothing through the density factor. A rule that sets this
  // computes its own penalty from the measured value instead. The
  // analyser calls it with the rule's matches, the word count, and
  // the scanned text, so the metric is recomputed from the same text
  // the scan judged. Rules without it use the standard
  // severity-weight x density-factor penalty.
  penaltyFor?: (matches: RawMatch[], words: number, text: string) => number
}

export const severityWeight: Record<Severity, number> = {
  high: 15,
  medium: 9,
  low: 4,
}

export const severityLabel: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const severityRank: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export const groupMeta: Record<GroupId, { label: string; blurb: string }> = {
  voice: {
    label: 'Voice',
    blurb: 'Words that perform confidence instead of naming a capability.',
  },
  claims: {
    label: 'Claims',
    blurb: 'Numbers, credentials, and praise that arrive without proof.',
  },
  actions: {
    label: 'Actions',
    blurb: 'Labels that hide what the click actually does.',
  },
  format: {
    label: 'Format',
    blurb: 'Typographic habits borrowed from templates.',
  },
  structure: {
    label: 'Structure',
    blurb: 'The shape of the writing: cadence, repetition, and density.',
  },
  diversity: {
    label: 'Diversity',
    blurb:
      'How varied the writing is: sentence lengths, word choice, and how paragraphs open.',
  },
  substance: {
    label: 'Substance',
    blurb:
      'Whether the text says anything concrete, or only sounds as if it does.',
  },
}

export const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const phraseSource = (phrase: string) =>
  phrase
    .trim()
    .split(/\s+/)
    // A `*` in a phrase is one to three words of any shape, so
    // "unlock your * potential" catches "unlock your full potential",
    // "unlock your full true potential", and "unlock your full true
    // shining potential" — a two-word modifier or determiner
    // inserted into a phrase no longer breaks detection. The gap is
    // bounded at three: a four-word gap does not match, so the
    // wildcard cannot swallow half a sentence and fire on unrelated
    // words that happen to share a frame. The gap itself ends in a
    // word, not a separator: the separator before the next phrase
    // word is the join below, so a one-word gap still matches.
    .map((word) =>
      word === '*'
        ? '(?:[^\\s\\-\\u2014\\uE000]+[\\s\\-\\u2014\\uE000]+){0,2}[^\\s\\-\\u2014\\uE000]+'
        : escapeRegExp(word),
    )
    // Words in a phrase may be joined by a space, a hyphen, an em dash
    // (a unified separator dash), or an underscore placeholder. The
    // normalised text uses U+2014 for standalone dashes and U+E000 for
    // underscores, so both have to count as separators here.
    .join('[\\s\\-\\u2014\\uE000]+')

export const matchPhrases = (phrases: readonly string[]) => {
  const source = phrases.map(phraseSource).join('|')
  const pattern = new RegExp(`\\b(?:${source})\\b`, 'gi')

  return (text: string): RawMatch[] => {
    const matches: RawMatch[] = []
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0
      matches.push({ start, end: start + match[0].length })
    }
    return matches
  }
}

export const matchPattern = (pattern: RegExp) => (text: string): RawMatch[] => {
  const matches: RawMatch[] = []
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    matches.push({ start, end: start + match[0].length })
  }
  return matches
}

// Sentences, with offsets in the scanned text. A period only ends a
// sentence when whitespace or the end of the draft follows it, so
// "99.9%" and "v2.0" do not split a sentence. Newlines are boundaries
// too, so a heading or a list item is its own sentence. Several
// rules need sentence context — the "not just" cadence, the structural
// checks, and the context exemptions — so they share this one splitter.
export interface SentenceSpan {
  start: number
  end: number
}

export const sentenceSpans = (text: string): SentenceSpan[] => {
  const spans: SentenceSpan[] = []
  let inFence = false
  let offset = 0
  for (const line of text.split('\n')) {
    const lineStart = offset
    const lineEnd = offset + line.length
    offset = lineEnd + 1
    const trimmed = line.trim()
    // Markdown structure is not prose: table rows and fenced code
    // blocks are skipped, so a table of similar-length rows is not
    // mistaken for a run of same-length sentences.
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
          while (
            start < lineEnd &&
            (text[start] === ' ' || text[start] === '\t')
          ) {
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

export const sentenceIndexAt = (spans: SentenceSpan[], position: number): number => {
  for (let i = 0; i < spans.length; i += 1) {
    if (position >= spans[i].start && position < spans[i].end) return i
  }
  return spans.length - 1
}

export const wordsIn = (text: string): string[] =>
  text.toLowerCase().split(/[^a-z0-9'’]+/).filter(Boolean)

export const countWordsIn = (text: string): number => {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
}

// Paragraphs: blocks separated by a blank line. A single newline is a
// line break inside a paragraph, not a new paragraph — a list of short
// lines is one paragraph for the substance check.
export const paragraphSpans = (text: string): SentenceSpan[] => {
  const spans: SentenceSpan[] = []
  const pattern = /(?:^|\n)\s*\n/g
  let start = 0
  for (const match of text.matchAll(pattern)) {
    const end = (match.index ?? 0) + (match[0].startsWith('\n') ? 0 : 1)
    if (end > start && text.slice(start, end).trim()) {
      spans.push({ start, end })
    }
    start = (match.index ?? 0) + match[0].length
  }
  if (text.slice(start).trim()) spans.push({ start, end: text.length })
  return spans
}

// Formal registers are legitimately uniform: a contract repeats
// defined terms, and API documentation repeats command names. The
// diversity rules (burstiness, type-token ratio, repeated bigrams)
// do not fire on formal sentences, because the uniformity is the
// genre, not the writer. The exemption is per sentence, not per
// draft: one legal sentence in a 2,245-word draft must not exempt
// the other 2,200 words — the formal sentences are removed and the
// rest of the draft is measured on its own. The markers are
// deliberately narrow — a few legal or technical words do not
// exempt a marketing page.
const LEGAL_MARKERS =
  /\b(?:licensee|licensor|pursuant to|notwithstanding|hereinafter|hereby|indemnif|arbitration|jurisdiction)\b/i

const TECHNICAL_MARKERS =
  /```|(?:^|\s)(?:npm|npx|yarn|pnpm|pip|bun|git|docker|curl)\s+\S+|\bexit code\b|\bflag\b.*\b(?:--\w+)\b|(?:^|\n)\s*(?:returns|parameters|arguments|options):/i

export const isFormalSentence = (sentence: string): boolean =>
  LEGAL_MARKERS.test(sentence) || TECHNICAL_MARKERS.test(sentence)

// The draft with its formal sentences removed, for the diversity
// measurements. The rules do not fire if too little text is left.
export const stripFormalSentences = (text: string): string =>
  sentenceSpans(text)
    .filter((span) => !isFormalSentence(text.slice(span.start, span.end)))
    .map((span) => text.slice(span.start, span.end))
    .join(' ')

// Words that are capitalised only because they start a sentence, not
// because they name anything. A capitalised word counts as a name only
// when it is not one of these.
export const SENTENCE_START_WORDS = new Set([
  'According',
  'Per',
  'In',
  'On',
  'As',
  'The',
  'A',
  'An',
  'This',
  'That',
  'These',
  'Those',
  'It',
  'Its',
  'We',
  'Our',
  'For',
  'With',
  'From',
  'By',
  'At',
  'To',
  'And',
  'But',
  'Or',
  'So',
  'If',
  'When',
  'While',
  'After',
  'Before',
  'During',
  'Between',
  'Among',
  'About',
  'Over',
  'Under',
  'New',
  'Latest',
  'Recent',
  'Full',
  'Read',
  'See',
  'Check',
  'Learn',
  'More',
  'Here',
  'There',
  'Now',
  'Today',
  'Last',
  'Next',
  'Said',
  'Says',
  'One',
])
