// Structure — the shape of the writing: cadence, repetition, and density.

import {
  countWordsIn,
  likelyNonEnglish,
  sentenceSpans,
  wordsIn,
  type RawMatch,
  type RuleDefinition,
  type SentenceSpan,
} from './common'

// A run of four or more consecutive sentences, each at least three
// words long, whose lengths differ by at most one word. Machine-made
// copy often marches in step; varied human writing does not. A softer
// signal catches near-runs too: five or more sentences whose lengths
// differ by at most two words. A near-run that overlaps a strict run
// is the same cadence, not a second one, so it is not reported twice.
const collectLengthRuns = (
  sentences: Array<SentenceSpan & { words: number }>,
  maxSpread: number,
  minRun: number,
): RawMatch[] => {
  const matches: RawMatch[] = []
  let run: typeof sentences = []
  let runMin = 0
  let runMax = 0
  const flush = () => {
    if (run.length >= minRun) {
      matches.push({ start: run[0].start, end: run[run.length - 1].end })
    }
    run = []
  }
  for (const sentence of sentences) {
    if (sentence.words < 3) {
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
    if (nextMax - nextMin <= maxSpread) {
      run.push(sentence)
      runMin = nextMin
      runMax = nextMax
    } else {
      flush()
      run = [sentence]
      runMin = sentence.words
      runMax = sentence.words
    }
  }
  flush()
  return matches
}

const sameLengthSentences = (text: string): RawMatch[] => {
  // Sentence rhythm is calibrated on English; a non-English draft
  // is not judged on it (F33).
  if (likelyNonEnglish(text)) return []
  // Dialogue lines are turns, not sentences on autopilot: a line
  // that opens with a dash ("— Bonjour") never counts toward a run
  // of same-length sentences.
  const sentences = sentenceSpans(text)
    .filter(
      (span) => !/^\s*[—–-]/.test(text.slice(span.start, span.end)),
    )
    .map((span) => ({
      ...span,
      words: countWordsIn(text.slice(span.start, span.end)),
    }))
  const strict = collectLengthRuns(sentences, 1, 4)
  const near = collectLengthRuns(sentences, 2, 5).filter(
    (run) => !strict.some((other) => run.start < other.end && other.start < run.end),
  )
  return [...strict, ...near].sort((a, b) => a.start - b.start)
}

// Three or more consecutive sentences that open with the same two
// words: "In the morning, we plan. In the afternoon, we build. In
// the evening, we ship." One repeated opening is a habit; three in a
// row is a cadence. Pronoun-led openings are rhetorical anaphora,
// not a cadence on autopilot — "I am the storm. I am the fire. I am
// the light." is a lyric device — so sentences opening with I, we,
// you, he, she, or they never start or continue a run.
const PRONOUN_OPENINGS = new Set(['i', 'we', 'you', 'he', 'she', 'they'])

const repeatedOpenings = (text: string): RawMatch[] => {
  const sentences = sentenceSpans(text).map((span) => {
    const words = wordsIn(text.slice(span.start, span.end))
    return {
      ...span,
      opening: words.slice(0, 2).join(' '),
      first: words[0] ?? '',
      words: words.length,
    }
  })
  const matches: RawMatch[] = []
  let run: typeof sentences = []
  const flush = () => {
    if (run.length >= 3) {
      matches.push({ start: run[0].start, end: run[run.length - 1].end })
    }
    run = []
  }
  for (const sentence of sentences) {
    if (
      sentence.words < 3 ||
      sentence.opening === '' ||
      PRONOUN_OPENINGS.has(sentence.first)
    ) {
      flush()
      continue
    }
    if (run.length === 0 || run[0].opening === sentence.opening) {
      run.push(sentence)
    } else {
      flush()
      run = [sentence]
    }
  }
  flush()
  return matches
}

// Words ending in "ly" that are not adverbs: only, early, daily, a
// family. Everything else ending in "ly" counts. A sentence with
// three or more of them is stuffed: "very quickly and extremely
// efficiently, really thoroughly and quite remarkably".
const NON_ADVERB_LY = new Set([
  'only',
  'early',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'family',
  'friendly',
  'lovely',
  'lonely',
  'ugly',
  'likely',
  'lively',
  'costly',
  'deadly',
  'elderly',
  'orderly',
  'worldly',
  'godly',
  'manly',
  'womanly',
  'kingly',
  'cowardly',
  'scholarly',
  'unholy',
  'unruly',
  'surly',
  'burly',
  'curly',
  'jolly',
  'holy',
  'lowly',
  'silly',
])

const adverbDensity = (text: string): RawMatch[] => {
  const matches: RawMatch[] = []
  const spans = sentenceSpans(text)
  const counts = spans.map((sentence) => {
    const words = wordsIn(text.slice(sentence.start, sentence.end))
    return words.filter(
      (word) => word.length > 4 && word.endsWith('ly') && !NON_ADVERB_LY.has(word),
    ).length
  })
  for (let i = 0; i < spans.length; i += 1) {
    if (counts[i] >= 3) {
      matches.push({ start: spans[i].start, end: spans[i].end })
      continue
    }
    // Two adjacent sentences, each carrying two adverbs, are stuffed
    // together even though neither is stuffed alone. Three adverbs
    // split 2-and-1 across two sentences stay clean: that is ordinary
    // writing, and the threshold has to be visible in METHOD.md.
    if (i + 1 < spans.length && counts[i] >= 2 && counts[i + 1] >= 2) {
      matches.push({ start: spans[i].start, end: spans[i + 1].end })
    }
  }
  // A pair span contains the single-sentence span inside it, so the
  // single one is the same evidence, not a second hit.
  return matches.filter(
    (match, index) =>
      !matches.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          match.start >= other.start &&
          match.end <= other.end,
      ),
  )
}

// Vocabulary and cliché inventories. Exported so the tests can count
// them: the vocabulary total is the distinct strings across the four
// vocabulary lists, and the cliché total is the distinct strings
// across the cliché lists. Every entry is a literal phrase the
// scanner matches; word forms are listed separately.

// The rule of three on autopilot: everything arrives in tidy
// triplets. Two shapes are caught: "more X, more Y, more Z", and a
// triplet of single-word adjectives ("efficient, scalable, and
// reliable"). Ordinary lists are not caught: "apples, oranges, and
// bananas" is nouns, not adjectives. The two shapes have different
// bars: "more X, more Y, more Z" is a marketing cadence, so two of
// them fire, but an adjective triplet is also a literary device —
// two triplets in 22 words is a paragraph, not a pattern — so
// adjective triplets need three. Either shape still needs the
// density gate: more than one triplet per 200 words.
const ADJECTIVE_TRIPLET_WORD = new Set([
  'efficient', 'scalable', 'reliable', 'fast', 'secure', 'simple',
  'powerful', 'flexible', 'robust', 'seamless', 'intuitive', 'modern',
  'smart', 'agile', 'dynamic', 'innovative', 'cutting-edge', 'elegant',
])

const isAdjectiveLike = (word: string): boolean =>
  ADJECTIVE_TRIPLET_WORD.has(word) ||
  /(?:able|ible|ive|ous|al|ic|ful|less|ed|ing|ly)$/.test(word)

const ruleOfThree = (text: string): RawMatch[] => {
  const words = countWordsIn(text)
  const spans = sentenceSpans(text)
  const moreMatches: RawMatch[] = []
  const adjMatches: RawMatch[] = []
  const morePattern =
    /\bmore\s+[\p{L}]+,\s*more\s+[\p{L}]+,\s*and\s+more\s+[\p{L}]+/giu
  const adjPattern =
    /\b([\p{L}]+),\s*([\p{L}]+),\s*and\s+([\p{L}]+)\b/giu
  for (const span of spans) {
    const body = text.slice(span.start, span.end)
    for (const match of body.matchAll(morePattern)) {
      moreMatches.push({
        start: span.start + (match.index ?? 0),
        end: span.start + (match.index ?? 0) + match[0].length,
      })
    }
    for (const match of body.matchAll(adjPattern)) {
      const items = [match[1], match[2], match[3]].map((w) =>
        w.toLowerCase(),
      )
      if (items.every(isAdjectiveLike)) {
        adjMatches.push({
          start: span.start + (match.index ?? 0),
          end: span.start + (match.index ?? 0) + match[0].length,
        })
      }
    }
  }
  const unique = [...moreMatches, ...adjMatches].filter(
    (match, index, all) =>
      all.findIndex(
        (other) => other.start === match.start && other.end === match.end,
      ) === index,
  )
  const fires =
    (moreMatches.length >= 2 || adjMatches.length >= 3) &&
    unique.length > words / 200
  return fires ? unique : []
}

export const structureRules: RuleDefinition[] = [
  {
    id: 'same-length-sentences',
    label: 'Same-length sentences',
    group: 'structure',
    severity: 'low',
    note: 'Four or more sentences in a row, all nearly the same length, march in step instead of varying. Five or more in a row within two words of each other count too, as a near-run.',
    fix: 'Break the rhythm: shorten one sentence, lengthen another.',
    scan: sameLengthSentences,
  },
  {
    id: 'repeated-openings',
    label: 'Repeated sentence openings',
    group: 'structure',
    severity: 'low',
    note: 'Three or more sentences in a row that open with the same two words. Pronoun-led openings (I am, We are) are rhetorical anaphora and are left alone.',
    fix: 'Vary the openings, or merge the sentences.',
    scan: repeatedOpenings,
  },
  {
    id: 'adverb-density',
    label: 'Adverb-stuffed sentence',
    group: 'structure',
    severity: 'low',
    note: 'A sentence carrying three or more -ly adverbs leans on emphasis instead of saying anything specific. Two adjacent sentences carrying two each count the same way.',
    fix: 'Keep the strongest adverb, or name what actually happened.',
    scan: adverbDensity,
  },
  {
    id: 'rule-of-three',
    label: 'Rule of three on autopilot',
    group: 'structure',
    severity: 'low',
    note: 'Everything arrives in tidy triplets: more X, more Y, more Z, or three single-word adjectives in a row. The "more" shape fires at two triplets; adjective triplets need three, because two triplets is also a literary paragraph. Either way the count has to be more than one per 200 words. Ordinary lists of nouns are not caught.',
    fix: 'Say the one thing that matters, or give the list a reason to exist.',
    scan: ruleOfThree,
  },
]
