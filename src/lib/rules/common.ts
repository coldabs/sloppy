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

// A phrase-list entry is a plain string, or a phrase with a context
// exemption: `exempt` returns true when the match is a legitimate
// use in context, so it is not a finding (F27). It gets the scanned
// text and the match's start index; it re-matches its own word from
// there, so it can look at what follows, and looks back at what
// precedes. A match that belongs to no entry (which should not
// happen) is kept: exemptions fail safe, never silent.
export interface PhraseEntry {
  phrase: string
  exempt?: (text: string, index: number) => boolean
}

export const phraseText = (entry: string | PhraseEntry): string =>
  typeof entry === 'string' ? entry : entry.phrase

export const matchPhrases = (
  phrases: readonly (string | PhraseEntry)[],
) => {
  const entries: PhraseEntry[] = phrases.map((entry) =>
    typeof entry === 'string' ? { phrase: entry } : entry,
  )
  const source = entries.map((entry) => phraseSource(entry.phrase)).join('|')
  const pattern = new RegExp(`\\b(?:${source})\\b`, 'gi')
  // One anchored pattern per entry, to find which entry a combined
  // match belongs to.
  const entryPatterns = entries.map(
    (entry) => new RegExp(`^(?:${phraseSource(entry.phrase)})$`, 'i'),
  )

  return (text: string): RawMatch[] => {
    const matches: RawMatch[] = []
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0
      const entryIndex = entryPatterns.findIndex((entryPattern) =>
        entryPattern.test(match[0]),
      )
      const entry = entryIndex >= 0 ? entries[entryIndex] : undefined
      if (entry?.exempt?.(text, start)) continue
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

// Spans are sorted by start and non-overlapping, so the sentence
// containing a position is a binary search, not a scan: a linear
// scan here was quadratic on long drafts (F5 — repeatedBigrams
// calls this once per token, so 170k sentences x 1.5M tokens
// never finished). A position past the last span belongs to the
// last sentence, as before.
export const sentenceIndexAt = (spans: SentenceSpan[], position: number): number => {
  let lo = 0
  let hi = spans.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (position < spans[mid].start) hi = mid - 1
    else if (position >= spans[mid].end) lo = mid + 1
    else return mid
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

// Common function words in German, French, Spanish, Italian,
// Portuguese, and Dutch. A word counts as non-English evidence only
// when it is not also a common English word, so "in", "is", "no",
// "as", "do", "met", "door", "over", "per", "a", "o", "e", "i", and
// single letters are left out — they would count English text as
// foreign. The sets are the most frequent function words, which are
// the ones that show up in any paragraph. Tokens are matched with a
// Unicode word pattern (not wordsIn, which folds diacritics away),
// so "für", "über", "à", "não", and "è" count.
// Sentence rhythm is calibrated on English (the diversity and
// structure thresholds come from an English corpus), so the rhythm
// rules do not judge a draft that is not English (F33). The
// vocabulary and phrase rules are already English-only by their
// word lists, and the em-dash and number rules fire on any text
// because dashes and digits are not English.
const NON_ENGLISH_FUNCTION_WORDS = new Set([
  // German
  'die', 'der', 'das', 'und', 'ist', 'sie', 'wir', 'bei', 'den', 'dem',
  'des', 'eine', 'von', 'zu', 'mit', 'für', 'auf', 'im', 'es', 'er',
  'ich', 'nicht', 'auch', 'als', 'nach', 'vor', 'über', 'sich', 'sind',
  'haben', 'hat', 'wird', 'werden', 'kann', 'nur', 'noch', 'aus', 'an',
  'zum', 'zur', 'sein', 'war', 'waren', 'schon', 'sehr', 'oder', 'aber',
  'wenn', 'dann', 'dass', 'durch', 'gegen', 'ohne', 'unter', 'zwischen',
  'bis', 'seit', 'seitdem', 'ganz', 'alle', 'kein', 'keine',
  // French
  'le', 'la', 'les', 'de', 'des', 'du', 'et', 'est', 'il', 'ils',
  'elle', 'nous', 'vous', 'je', 'tu', 'un', 'une', 'dans', 'sur',
  'pour', 'avec', 'qui', 'que', 'pas', 'plus', 'au', 'aux', 'en',
  'sont', 'ont', 'être', 'avoir', 'ce', 'cette', 'ces', 'mon', 'ton',
  'son', 'notre', 'votre', 'leur', 'mais', 'où', 'donc', 'car', 'ne',
  'ça', 'cela', 'comme', 'tout', 'tous', 'toute', 'toutes', 'très',
  'bien', 'mal', 'sans', 'sous', 'chez', 'entre', 'après', 'avant',
  'depuis', 'pendant', 'contre', 'vers', 'par', 'à',
  // Spanish
  'el', 'los', 'las', 'es', 'un', 'del', 'se', 'por', 'con', 'su',
  'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'este',
  'esta', 'cuando', 'muy', 'sin', 'sobre', 'también', 'hasta', 'hay',
  'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'uno', 'les',
  'ni', 'eso', 'ante', 'ellos', 'esto', 'antes', 'algunos', 'qué',
  'yo', 'otro', 'otras', 'otra', 'él', 'tanto', 'esa', 'estos',
  'mucho', 'quienes', 'nada', 'muchos', 'cual', 'poco', 'ella',
  'estar', 'estas', 'algunas', 'algo', 'nosotros', 'mi', 'mis', 'tú',
  'te', 'ti', 'tu', 'tus',
  // Italian
  'gli', 'di', 'che', 'non', 'da', 'su', 'tra', 'fra', 'è', 'sono',
  'uno', 'del', 'della', 'dei', 'degli', 'delle', 'alla', 'ai',
  'agli', 'alle', 'nel', 'nella', 'nei', 'negli', 'nelle', 'sul',
  'sulla', 'sui', 'sugli', 'sulle', 'ci', 'si', 'vi', 'ne', 'ma',
  'più', 'anche', 'questo', 'questa', 'questi', 'queste', 'quello',
  'quella', 'quelli', 'quelle', 'molto', 'tanto', 'tutto', 'tutti',
  'tutta', 'tutte',
  // Portuguese
  'os', 'em', 'um', 'uma', 'uns', 'umas', 'dos', 'das', 'nos', 'nas',
  'pelo', 'pela', 'pelos', 'pelas', 'aos', 'às', 'lhe', 'lhes', 'me',
  'vos', 'ele', 'ela', 'eles', 'elas', 'eu', 'nós', 'vós', 'este',
  'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela', 'aqueles',
  'aquelas', 'isto', 'isso', 'aquilo', 'não', 'sim', 'mais', 'pouco',
  'todos', 'toda', 'outro', 'outra', 'outros', 'outras', 'mesmo',
  'mesma', 'mesmos', 'mesmas', 'já', 'ainda', 'só', 'bem', 'quando',
  'onde', 'porque', 'mas', 'nem', 'pois', 'então', 'assim', 'depois',
  'agora', 'hoje', 'ontem', 'sempre', 'nunca', 'talvez', 'apenas',
  'até', 'sob', 'após', 'através', 'sem',
  // Dutch
  'het', 'een', 'van', 'ik', 'te', 'dat', 'hij', 'niet', 'zijn',
  'aan', 'als', 'voor', 'heeft', 'had', 'kunnen', 'maar', 'om',
  'hem', 'dan', 'zou', 'mijn', 'dit', 'zo', 'ze', 'zich', 'bij',
  'ook', 'tot', 'je', 'mij', 'uit', 'der', 'daar', 'hun', 'nu', 'en',
])

const ENGLISH_FUNCTION_WORDS = new Set([
  'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'it', 'its', 'this', 'that', 'these', 'those', 'you', 'he',
  'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my',
  'your', 'his', 'our', 'their', 'in', 'on', 'at', 'to', 'of', 'for',
  'with', 'by', 'from', 'as', 'into', 'over', 'under', 'after',
  'before', 'between', 'through', 'during', 'without', 'about',
  'against', 'not', 'no', 'do', 'does', 'did', 'have', 'has', 'had',
  'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must',
  'shall', 'am', 'if', 'then', 'than', 'so', 'such', 'only', 'own',
  'same', 'too', 'very', 'just', 'also', 'more', 'most', 'other',
  'some', 'any', 'each', 'few', 'now',
])

// True when the draft is likely not English: the non-English
// function words outnumber the English ones, with at least three of
// them. A single foreign word — a name, a quote, a loanword — does
// not exempt a draft, and a tie defaults to English.
export const likelyNonEnglish = (text: string): boolean => {
  let nonEnglish = 0
  let english = 0
  for (const match of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (NON_ENGLISH_FUNCTION_WORDS.has(match)) nonEnglish += 1
    else if (ENGLISH_FUNCTION_WORDS.has(match)) english += 1
  }
  return nonEnglish >= 3 && nonEnglish > english
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
