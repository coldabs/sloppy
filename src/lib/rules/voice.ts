// Voice — words that perform confidence instead of naming a capability.

import {
  countWordsIn,
  matchPhrases,
  matchPattern,
  sentenceIndexAt,
  sentenceSpans,
  type RawMatch,
  type RuleDefinition,
} from './common'

// An em dash counts when it is used as a pause: standing alone, with a
// space on at least one side, at the start or end of the draft, or
// doubled (the "--" habit). An em dash inside a word is a compound
// separator, not a pause, so "word—word" is left alone. HTML entities
// for the em dash count the same way. A dash that is document structure
// rather than a pause is left alone too: a line with no words on it (a
// markdown table separator or horizontal rule), a dash between two
// links (") - [", the separator in a table of contents), or a dash
// that opens a line of dialogue (the French, Russian, and Spanish
// convention, "— Bonjour"), which is a speaker turn, not a pause.
// A double hyphen attached to a word — "--json", a command-line flag —
// is not a pause either.
const emDashPauses = (text: string): RawMatch[] => {
  const isWordChar = (ch: string | undefined): boolean =>
    ch !== undefined && /[\p{L}\p{N}]/u.test(ch)
  const matches: RawMatch[] = []
  for (const match of text.matchAll(/&mdash;|&#8212;|\u2014+/g)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (match[0].startsWith('&')) {
      // A line-initial entity dash followed by a letter is a dialogue
      // opener too ("&mdash; Bonjour"), not a pause.
      const entityLineStart = text.lastIndexOf('\n', start - 1) + 1
      if (text.slice(entityLineStart, start).trim() === '') {
        let k = end
        while (k < text.length && (text[k] === ' ' || text[k] === '\t')) {
          k += 1
        }
        if (k < text.length && /[\p{L}]/u.test(text[k])) continue
      }
      matches.push({ start, end })
      continue
    }
    const before = start === 0 ? undefined : text[start - 1]
    const after = end >= text.length ? undefined : text[end]
    // A run of two or more dashes with a word character right after
    // it and no word character before it is a command-line flag
    // ("--json"), not a pause.
    if (match[0].length >= 2 && isWordChar(after) && !isWordChar(before)) {
      continue
    }
    if (match[0].length < 2 && isWordChar(before) && isWordChar(after)) {
      continue
    }
    const lineStart = text.lastIndexOf('\n', start - 1) + 1
    const nextNewline = text.indexOf('\n', end)
    const lineEnd = nextNewline === -1 ? text.length : nextNewline
    const line = text.slice(lineStart, lineEnd)
    const lineWithoutMatch =
      line.slice(0, start - lineStart) + line.slice(end - lineStart)
    if (!/[\p{L}\p{N}]/u.test(lineWithoutMatch)) continue
    let j = start - 1
    while (j >= lineStart && (text[j] === ' ' || text[j] === '\t')) j -= 1
    const prevNonSpace = j >= lineStart ? text[j] : undefined
    let k = end
    while (k < lineEnd && (text[k] === ' ' || text[k] === '\t')) k += 1
    const nextNonSpace = k < lineEnd ? text[k] : undefined
    if (prevNonSpace === ')' && nextNonSpace === '[') continue
    // A dash that opens a line of dialogue — the French, Russian, and
    // Spanish convention ("— Bonjour, dit-elle.") — is a speaker turn,
    // not a pause. It is the first non-space character on its line
    // (prevNonSpace is undefined) and the next non-space character
    // is a letter. Mid-sentence dashes still count.
    if (
      prevNonSpace === undefined &&
      nextNonSpace !== undefined &&
      /[\p{L}]/u.test(nextNonSpace)
    ) {
      continue
    }
    matches.push({ start, end })
  }
  // A pair of dashes in one sentence is a single interruption — "She
  // said — and I quote — that it was fine." — so it counts once, not
  // twice. Unpaired dashes count on their own.
  const spans = sentenceSpans(text)
  const bySentence = new Map<number, RawMatch[]>()
  for (const match of matches) {
    const index = sentenceIndexAt(spans, match.start)
    const list = bySentence.get(index) ?? []
    list.push(match)
    bySentence.set(index, list)
  }
  const paired: RawMatch[] = []
  for (const list of bySentence.values()) {
    for (let i = 0; i < list.length; i += 2) {
      paired.push(list[i])
    }
  }
  return paired.sort((a, b) => a.start - b.start)
}

// Density, not presence, is the signal. A single em dash in a short
// note is a stylistic choice, and dash-heavy literary prose measures
// around 10 interruptions per 1,000 words. The rule fires only when
// a draft carries more than 20 pause-dashes per 1,000 words and at
// least 3 of them. The threshold is calibrated on the P2 corpus — a
// Twain-style passage at 10 per 1,000 stays clean, a draft that puts
// a dash in nearly every sentence measures 60+ — and the published
// human range (0.33–17.12 per 1,000, mean 3.23, eight published
// essays; Freeburg 2026, "The Last Fingerprint"; GPT-4.1 at 10.62)
// sits below it. Severity is medium: a dash is a keystroke, not a
// thought.
export const EM_DASH_DENSITY_THRESHOLD = 20

export const EM_DASH_MIN_COUNT = 3

const emDash = (text: string): RawMatch[] => {
  const pauses = emDashPauses(text)
  if (pauses.length < EM_DASH_MIN_COUNT) return []
  const words = countWordsIn(text)
  if (words === 0) return []
  const density = (pauses.length / words) * 1000
  return density > EM_DASH_DENSITY_THRESHOLD ? pauses : []
}

// The "not just X, but Y" cadence is matched at sentence level, not
// against a fixed character count. The old rule stopped at 48
// characters, so a realistic long clause escaped it. The twist usually
// sits in the same sentence as the setup; a twist on the next line
// still belongs to the setup when the setup line ends with a comma —
// "Not just a tool,\nbut a partner." "Yet" counts as a twist too:
// "Not just a tool, yet a whole new way of working."
//
// The twist can also open the next sentence — "This is not just a
// tool. It is a whole new way of working." — but only when it
// reframes rather than reports: the next sentence has to open with a
// pronoun + is/are/was/were followed by an article or "more" ("It is
// a whole new way", "It is more than a tool"). A twist that merely
// reports ("It is blocking the release", "It is about trust") does
// not count (F20, designed with F26).
const NOT_JUST_SETUP = /\bnot\s+(?:just|only|merely)\b/i

const CROSS_SENTENCE_TWIST =
  /^\s*(?:it|this|that|they|he|she)\s+(?:is|are|was|were)\s+(?:a|an|the|more)\b/i

const notJust = (text: string): RawMatch[] => {
  // The "it's / it is" twist must reframe, not report: it has to be
  // followed by an article or "more" — "it is a whole new way of
  // working" counts, "it is blocking the release" does not (F26,
  // the other half of the F20 design; the cross-sentence twist
  // already restricts the same way).
  const pattern =
    /\bnot\s+(?:just|only|merely)\b[\s\S]*?\b(?:but|yet|(?:it'?s|it\s+is)\s+(?:a|an|the|more)\b)/gi
  const matches: RawMatch[] = []
  const spans = sentenceSpans(text)
  for (let i = 0; i < spans.length; i += 1) {
    const sentence = spans[i]
    let body = text.slice(sentence.start, sentence.end)
    const endsWithComma = /,\s*$/.test(body)
    if (endsWithComma && i + 1 < spans.length) {
      body += '\n' + text.slice(spans[i + 1].start, spans[i + 1].end)
    }
    for (const match of body.matchAll(pattern)) {
      const start = sentence.start + (match.index ?? 0)
      matches.push({ start, end: start + match[0].length })
    }
    // Cross-sentence twist. The comma case above already covers a
    // twist on the next line, so this pass only runs when the setup
    // sentence ends with a full stop.
    if (!endsWithComma && i + 1 < spans.length) {
      const setup = NOT_JUST_SETUP.exec(body)
      if (setup) {
        const next = text.slice(spans[i + 1].start, spans[i + 1].end)
        const twist = CROSS_SENTENCE_TWIST.exec(next)
        if (twist) {
          matches.push({
            start: sentence.start + (setup.index ?? 0),
            end: spans[i + 1].start + (twist.index ?? 0) + twist[0].length,
          })
        }
      }
    }
  }
  return matches
}

// "leverage" is a financial term, not a hype verb, when it is
// followed by "of + number" ("leverage of three to one", "leverage
// of 3 to 1") or preceded by uses|has|employs|with ("the fund uses
// leverage"). The verb forms (leverages, leveraged, leveraging) are
// not exempted: "leverage our synergies" is the hype use (F27).
const leverageExempt = (text: string, index: number): boolean => {
  const after = text.slice(index)
  if (
    /^leverage\s+of\s+(?:\d|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
      after,
    )
  ) {
    return true
  }
  return /\b(?:uses|has|employs|with)\s+$/i.test(text.slice(0, index))
}

// "seamless" is a literal garment description before a garment noun
// ("a seamless sleeve", "a seamless knit"), not the hype adjective
// (F27).
const seamlessExempt = (text: string, index: number): boolean =>
  /^seamless\s+(?:sleeve|sleeves|knit|knits|tube|tubes|yoke|yokes)\b/i.test(
    text.slice(index),
  )

export const BUZZWORD_PHRASES = [
  'ai-powered',
  'ai powered',
  'revolutionary',
  'next-generation',
  'next generation',
  'cutting-edge',
  'cutting edge',
  'groundbreaking',
  'unparalleled',
  { phrase: 'seamless', exempt: seamlessExempt },
  'seamlessly',
  'game-changing',
  'game changing',
  'game changer',
  'game changers',
  'unleash',
  'unleashes',
  'unleashed',
  'unleashing',
  'supercharge',
  'supercharges',
  'supercharged',
  'supercharging',
  'state-of-the-art',
  'state of the art',
  'best-in-class',
  'world-class',
  'industry-leading',
  'transformative',
  'disruptive',
  'synergy',
  'synergies',
  'paradigm shift',
  'paradigm shifts',
  'empower',
  'empowers',
  'empowered',
  'empowering',
  'effortless',
  'effortlessly',
  'innovative',
  'turnkey',
  { phrase: 'leverage', exempt: leverageExempt },
  'leverages',
  'leveraged',
  'leveraging',
  'elevate your',
  'elevates your',
  'elevating your',
  'take it to the next level',
  'in today\'s fast-paced world',
  'seam less',
  'revo lutionary',
  'ground breaking',
  'revolutionize',
  'revolutionizes',
  'revolutionized',
  'revolutionizing',
  'turbocharge',
  'turbocharges',
  'turbocharged',
  'turbocharging',
  'future-proof',
  'future proof',
  'next-level',
  'top-tier',
  'top tier',
  'market-leading',
  'award-winning',
  'unprecedented',
  'unmatched',
  'unrivaled',
  'unrivalled',
  'unbeatable',
  'trailblazing',
  'skyrocket',
  'skyrockets',
  'skyrocketed',
  'skyrocketing',
  'one-of-a-kind',
  'one of a kind',
  'second to none',
  'second-to-none',
  'like never before',
  'like no other',
  'world-changing',
  'world changing',
  'bleeding edge',
  'bleeding-edge',
  'powered by ai',
  'ai-driven',
  'ai driven',
  'unbelievable',
  'mind-blowing',
  'mind blowing',
  'changes the game',
  'change the game',
  'changing the game',
]

export const AI_TELL_PHRASES = [
  'delve',
  'delves',
  'delving',
  'tapestry',
  'tapestries',
  'furthermore',
  'moreover',
  'in conclusion',
  'embark',
  'embarks',
  'embarking',
  'realm',
  'navigate',
  'navigates',
  'navigating',
  'it\'s important to note',
  'it is important to note',
  'worth noting',
  'dive into',
  'in today\'s digital age',
  'as an ai language model',
  'welcome to the future of work',
  'unlock your potential',
  'unlock your * potential',
  'join us on this journey',
  'delved',
  'embarked',
  'navigated',
  'showcase',
  'showcases',
  'showcased',
  'showcasing',
  'underscore',
  'underscores',
  'underscored',
  'underscoring',
  'intricate',
  'intricacies',
  'intricacy',
  'intricately',
  'meticulous',
  'meticulously',
  'commendable',
  'garner',
  'garners',
  'garnered',
  'garnering',
  'surpass',
  'surpasses',
  'surpassed',
  'surpassing',
  'boast',
  'boasts',
  'boasted',
  'boasting',
]

export const AI_ADJECTIVE_PHRASES = [
  'crucial',
  'pivotal',
  'foster',
  'fosters',
  'robust',
  'landscape',
  'quintessential',
  'exemplary',
  'unwavering',
  'steadfast',
  'paramount',
  'fostered',
  'fostering',
]

export const STYLE_WORDS_TIER3 = [
  'align',
  'aligns',
  'aligned',
  'aligning',
  'emphasize',
  'emphasise',
  'emphasizes',
  'emphasises',
  'emphasized',
  'emphasised',
  'emphasizing',
  'emphasising',
  'advancement',
  'advancements',
  'pioneer',
  'pioneers',
  'pioneered',
  'pioneering',
  'notably',
  'notable',
  'additionally',
  'consequently',
  'ultimately',
  'undoubtedly',
  'remarkably',
  'exceptional',
  'extraordinary',
  'profound',
  'profoundly',
  'holistic',
  'invaluable',
  'indispensable',
  'comprehensive',
  'spearhead',
  'spearheads',
  'spearheaded',
  'spearheading',
  'champion',
  'champions',
  'championed',
  'championing',
  'orchestrate',
  'orchestrates',
  'orchestrated',
  'orchestrating',
  'cultivate',
  'cultivates',
  'cultivated',
  'cultivating',
]

export const OPENER_PHRASES = [
  'in today\'s world',
  'in today\'s fast-paced world',
  'in today\'s online world',
  'in a world where',
  'imagine a world',
  'ever wondered',
  'we\'ve all been there',
  'let\'s face it',
  'here\'s the thing',
  'in an era of',
  'picture this',
  'imagine this',
  'in the digital age',
  'in the modern world',
  'in our modern world',
  'in this day and age',
  'have you ever',
  'what if i told you',
  'the truth is',
  'listen up',
  'dear reader',
  'once upon a time',
  'it is no secret that',
  'there is no denying that',
  'needless to say',
  'in a fast-paced world',
  'in a fast paced world',
  'in this fast-paced world',
  'in this fast paced world',
]

export const TEMPLATE_CLOSER_PHRASES = [
  'to sum up',
  'to summarize',
  'in summary',
  'in closing',
  'all in all',
  'to wrap up',
  'wrapping up',
  'in a nutshell',
  'long story short',
  'thanks for reading',
  'stay tuned',
  'until next time',
  'that is all',
  'let me know what you think',
]

// Tier-3 style words only count in a cluster: one "notably" in an
// otherwise clean draft is ordinary writing, but three or more
// distinct tier-3 terms in one draft is the vocabulary narrowing
// that machine-written copy shows. A single term, however often
// repeated, never fires on its own. Distinct means distinct lemmas:
// "align", "aligned", and "aligning" are one term, not three, so
// one stem in three forms cannot satisfy the cluster on its own —
// the same lemma rule the clustered AI tells and AI adjectives use.
const STYLE_WORD_LEMMA: Record<string, string> = {
  align: 'align',
  aligns: 'align',
  aligned: 'align',
  aligning: 'align',
  emphasize: 'emphasize',
  emphasise: 'emphasize',
  emphasizes: 'emphasize',
  emphasises: 'emphasize',
  emphasized: 'emphasize',
  emphasised: 'emphasize',
  emphasizing: 'emphasize',
  emphasising: 'emphasize',
  advancement: 'advancement',
  advancements: 'advancement',
  pioneer: 'pioneer',
  pioneers: 'pioneer',
  pioneered: 'pioneer',
  pioneering: 'pioneer',
  notably: 'notable',
  notable: 'notable',
  profound: 'profound',
  profoundly: 'profound',
  spearhead: 'spearhead',
  spearheads: 'spearhead',
  spearheaded: 'spearhead',
  spearheading: 'spearhead',
  champion: 'champion',
  champions: 'champion',
  championed: 'champion',
  championing: 'champion',
  orchestrate: 'orchestrate',
  orchestrates: 'orchestrate',
  orchestrated: 'orchestrate',
  orchestrating: 'orchestrate',
  cultivate: 'cultivate',
  cultivates: 'cultivate',
  cultivated: 'cultivate',
  cultivating: 'cultivate',
}

const styleWordsTier3 = (text: string): RawMatch[] => {
  const matches = matchPhrases(STYLE_WORDS_TIER3)(text)
  const distinct = new Set(
    matches.map(
      (match) =>
        STYLE_WORD_LEMMA[text.slice(match.start, match.end).toLowerCase()] ??
        text.slice(match.start, match.end).toLowerCase(),
    ),
  )
  return distinct.size >= 3 ? matches : []
}

// Some AI tells are ordinary words in their home registers —
// "furthermore" and "moreover" are academic connective tissue,
// "delve" is what a historian does in an archive, "tapestry" is
// what a museum shows, "navigate" is what a sailor does, "showcase"
// is what an exhibition does. One of them alone is not a signal, so
// these phrases only count when four or more distinct ones cluster
// in the same draft: three connectives in one short academic
// paragraph ("Furthermore… Moreover… In conclusion…") is normal
// connective tissue, and four distinct tells together is the
// narrowing that machine-written copy shows. The other AI tells
// ("underscore", "intricate", "meticulous", "garner", "surpass",
// "boast", "it's important to note", "worth noting", "as an AI
// language model", and the rest) are not ordinary in any register,
// so they fire on their own.
const CLUSTERED_AI_TELL_PHRASES = [
  'furthermore',
  'moreover',
  'in conclusion',
  'delve',
  'delves',
  'delving',
  'delved',
  'tapestry',
  'tapestries',
  'navigate',
  'navigates',
  'navigating',
  'navigated',
  'showcase',
  'showcases',
  'showcased',
  'showcasing',
  'embark',
  'embarks',
  'embarking',
  'embarked',
  'realm',
]

const CLUSTERED_AI_TELL_LEMMA: Record<string, string> = {
  furthermore: 'furthermore',
  moreover: 'moreover',
  'in conclusion': 'in conclusion',
  delve: 'delve',
  delves: 'delve',
  delving: 'delve',
  delved: 'delve',
  tapestry: 'tapestry',
  tapestries: 'tapestry',
  navigate: 'navigate',
  navigates: 'navigate',
  navigating: 'navigate',
  navigated: 'navigate',
  showcase: 'showcase',
  showcases: 'showcase',
  showcased: 'showcase',
  showcasing: 'showcase',
  embark: 'embark',
  embarks: 'embark',
  embarking: 'embark',
  embarked: 'embark',
  realm: 'realm',
}

export const CLUSTERED_AI_TELL_MIN_DISTINCT = 4

const aiTells = (text: string): RawMatch[] => {
  const direct = matchPhrases(
    AI_TELL_PHRASES.filter(
      (phrase) => !CLUSTERED_AI_TELL_PHRASES.includes(phrase),
    ),
  )(text)
  const clustered = matchPhrases(CLUSTERED_AI_TELL_PHRASES)(text)
  const distinct = new Set(
    clustered.map(
      (match) =>
        CLUSTERED_AI_TELL_LEMMA[
          text.slice(match.start, match.end).toLowerCase()
        ] ?? text.slice(match.start, match.end).toLowerCase(),
    ),
  )
  return distinct.size >= CLUSTERED_AI_TELL_MIN_DISTINCT
    ? [...direct, ...clustered]
    : direct
}

// The AI adjectives are ordinary words in their home disciplines —
// "landscape" in geography, "foster" in social work, "crucial" in
// medicine, "robust" in engineering. One of them alone is not a
// signal, so they only count when three or more distinct ones
// appear in the same draft. Two distinct adjectives in a short
// technical paragraph ("robust" and "landscape" in API docs) is
// normal vocabulary, not a pile-up.
const AI_ADJECTIVE_LEMMA: Record<string, string> = {
  crucial: 'crucial',
  pivotal: 'pivotal',
  foster: 'foster',
  fosters: 'foster',
  fostered: 'foster',
  fostering: 'foster',
  robust: 'robust',
  landscape: 'landscape',
  quintessential: 'quintessential',
  exemplary: 'exemplary',
  unwavering: 'unwavering',
  steadfast: 'steadfast',
  paramount: 'paramount',
}

export const AI_ADJECTIVE_MIN_DISTINCT = 3

const aiAdjectives = (text: string): RawMatch[] => {
  const matches = matchPhrases(AI_ADJECTIVE_PHRASES)(text)
  const distinct = new Set(
    matches.map(
      (match) =>
        AI_ADJECTIVE_LEMMA[
          text.slice(match.start, match.end).toLowerCase()
        ] ?? text.slice(match.start, match.end).toLowerCase(),
    ),
  )
  return distinct.size >= AI_ADJECTIVE_MIN_DISTINCT ? matches : []
}

// Repeated marks and celebration emoji stand in for emphasis, and so
// does the same emoji three or more times in a row. A draft of nothing
// but emoji has no prose to hype, so the repeated-emoji half needs
// words around it — an emoji-only draft stays clean.
const hypePunctuation = (text: string): RawMatch[] => {
  const base = matchPattern(
    /[!?]{2,}|[\u{1F525}\u{1F680}\u{2728}\u{1F389}\u{1F4AF}\u{1F60D}\u{1F973}\u{1F64C}\u{1F44F}\u{1F4AA}\u{1F38A}\u{2B50}\u{1F31F}]/gu,
  )(text)
  if (countWordsIn(text) === 0) return base
  return [
    ...base,
    ...matchPattern(/(\p{Extended_Pictographic})\1{2,}/gu)(text),
  ].sort((a, b) => a.start - b.start)
}

export const voiceRules: RuleDefinition[] = [
  {
    id: 'em-dash',
    label: 'Em dash',
    group: 'voice',
    severity: 'medium',
    note: 'Em dashes only count at density: more than 20 pause-dashes per 1,000 words, and at least 3 of them. One dash in a short note, dash-heavy literary prose at 10 per 1,000, and command-line flags such as --json are left alone. A dash that opens a line of dialogue (— Bonjour) is a speaker turn, not a pause. A pair of dashes that opens and closes one interruption counts once, not twice.',
    fix: 'Use a comma, colon, period, or parentheses.',
    scan: emDash,
  },
  {
    id: 'buzzwords',
    label: 'Hype vocabulary',
    group: 'voice',
    severity: 'medium',
    note: 'Words that sell a feeling instead of naming a capability.',
    fix: 'Swap in a concrete capability, or delete the word.',
    scan: matchPhrases(BUZZWORD_PHRASES),
  },
  {
    id: 'ai-tells',
    label: 'AI tell phrases',
    group: 'voice',
    severity: 'medium',
    note: 'Stock phrases that show up in machine-written copy far more often than in human writing. The clustered tells (furthermore, moreover, in conclusion, delve, tapestry, navigate, showcase, embark, realm) only count when four or more distinct ones appear in one draft, because each is ordinary in its home register; the rest fire on their own.',
    fix: 'Delete the phrase, or say what actually happened.',
    scan: aiTells,
  },
  {
    id: 'ai-adjectives',
    label: 'AI adjectives',
    group: 'voice',
    severity: 'low',
    note: 'Confident adjectives that fill space without adding anything specific. Only counts when three or more distinct adjectives appear in one draft, because each is ordinary in its home discipline.',
    fix: 'Name the specific quality, or delete the word.',
    scan: aiAdjectives,
  },
  {
    id: 'style-words',
    label: 'Style words in a cluster',
    group: 'voice',
    severity: 'low',
    note: 'Formal style words (notably, additionally, holistic, pioneering) that are ordinary on their own. They only count when three or more distinct ones appear in the same draft — the clustering, not the word, is the signal.',
    fix: 'Use the plain word, or say what actually happened.',
    scan: styleWordsTier3,
  },
  {
    id: 'overused-opener',
    label: 'Template opener',
    group: 'voice',
    severity: 'low',
    note: 'An opening move copied from a thousand landing pages.',
    fix: 'Start with the claim itself.',
    scan: matchPhrases(OPENER_PHRASES),
  },
  {
    id: 'template-closer',
    label: 'Template closer',
    group: 'voice',
    severity: 'low',
    note: 'A stock sign-off that wraps a piece up without saying anything: to sum up, in summary, stay tuned, thanks for reading.',
    fix: 'End on the claim itself, or just stop.',
    scan: matchPhrases(TEMPLATE_CLOSER_PHRASES),
  },
  {
    id: 'not-just',
    label: 'Not just X, but Y',
    group: 'voice',
    severity: 'low',
    note: 'A stock cadence that promises a twist and then repeats itself. The twist sits in the same sentence, however long the clause is — or on the next line, when the setup line ends with a comma, or at the start of the next sentence, when it opens with a pronoun and reframes ("It is a whole new way of working"). A twist that merely reports ("It is blocking the release", "It is about trust") does not count. "Yet" counts as a twist too.',
    fix: 'State the claim once, directly.',
    scan: notJust,
  },
  {
    id: 'hype-punctuation',
    label: 'Hype punctuation',
    group: 'voice',
    severity: 'low',
    note: 'Repeated marks, celebration emoji, and the same emoji three or more times in a row stand in for emphasis. A single ordinary emoji on its own is left alone, and so is a draft of nothing but emoji.',
    fix: 'Keep one period and let the sentence carry the weight.',
    scan: hypePunctuation,
  },
]
