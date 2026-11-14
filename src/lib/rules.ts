import { UNDERSCORE_PLACEHOLDER } from './normalize'

export type Severity = 'high' | 'medium' | 'low'
export type GroupId = 'voice' | 'claims' | 'actions' | 'format'

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
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const phraseSource = (phrase: string) =>
  phrase
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    // Words in a phrase may be joined by a space, a hyphen, an em dash
    // (a unified separator dash), or an underscore placeholder. The
    // normalised text uses U+2014 for standalone dashes and U+E000 for
    // underscores, so both have to count as separators here.
    .join('[\\s\\-\\u2014\\uE000]+')

const matchPhrases = (phrases: readonly string[]) => {
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

const matchPattern = (pattern: RegExp) => (text: string): RawMatch[] => {
  const matches: RawMatch[] = []
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    matches.push({ start, end: start + match[0].length })
  }
  return matches
}

// A number is exempt only with a real citation next to it. The words
// "data" and "per" on their own never count, and neither does a bare
// mention of a report. A citation is either a link, or a named
// publication together with a year, within 40 characters of the number.
const CITATION_WINDOW = 40
const CITATION_URL = /https?:\/\/\S+|www\.\S+/i
const CITATION_YEAR = /\b(?:19|20)\d{2}\b/
const CITATION_PUBLICATION =
  /\b(?:report|study|survey|audit|paper|review|index|ranking)\b/i

const hasRealCitation = (context: string): boolean => {
  if (CITATION_URL.test(context)) return true
  return CITATION_YEAR.test(context) && CITATION_PUBLICATION.test(context)
}

const unsourcedNumbers = (text: string): RawMatch[] => {
  const pattern =
    /\b\d[\d,.]*\s?(?:%|\bpercent\b)|\b\d[\d,.]*\s?[kmb]\+?\b/gi
  const matches: RawMatch[] = []
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const context = text.slice(
      Math.max(0, start - CITATION_WINDOW),
      Math.min(text.length, end + CITATION_WINDOW),
    )
    if (hasRealCitation(context)) continue
    matches.push({ start, end })
  }
  return matches
}

const UPPERCASE_ALLOWLIST = new Set([
  'AI',
  'API',
  'APIS',
  'HTML',
  'CSS',
  'JS',
  'TS',
  'JSON',
  'HTTP',
  'HTTPS',
  'SQL',
  'SDK',
  'CLI',
  'CPU',
  'GPU',
  'RAM',
  'SSD',
  'PDF',
  'CSV',
  'URL',
  'URLS',
  'UI',
  'UX',
  'FAQ',
  'CEO',
  'CTO',
  'CMO',
  'COO',
  'USA',
  'UK',
  'EU',
  'GDPR',
  'HIPAA',
  'SOC',
  'ISO',
  'WCAG',
  'SEO',
  'CRM',
  'ERP',
  'SAAS',
  'B2B',
  'B2C',
  'LLC',
  'INC',
  'ASAP',
  'FYI',
  'TODO',
  'OK',
  'ROI',
  'KPI',
  'MVP',
  'NDA',
  'VPN',
  'DNS',
  'SSH',
  'FTP',
  'TCP',
  'UDP',
  'AWS',
  'GCP',
  'IOS',
  'AM',
  'PM',
  'README',
  'CHANGELOG',
])

const shoutingCaps = (text: string): RawMatch[] => {
  // A caps run counts only when it stands on its own. An underscore
  // placeholder on either side means the run is part of a snake_case
  // identifier such as MAX_RETRIES, not a shouted word.
  const pattern = new RegExp(
    `(?<![\\w${UNDERSCORE_PLACEHOLDER}])[A-Z][A-Z0-9]{2,}(?![\\w${UNDERSCORE_PLACEHOLDER}])`,
    'g',
  )
  const matches: RawMatch[] = []
  for (const match of text.matchAll(pattern)) {
    if (UPPERCASE_ALLOWLIST.has(match[0])) continue
    const start = match.index ?? 0
    matches.push({ start, end: start + match[0].length })
  }
  return matches
}

// An em dash counts when it is used as a pause: standing alone, with a
// space on at least one side, at the start or end of the draft, or
// doubled (the "--" habit). An em dash inside a word is a compound
// separator, not a pause, so "word—word" is left alone. HTML entities
// for the em dash count the same way. A dash that is document structure
// rather than a pause is left alone too: a line with no words on it (a
// markdown table separator or horizontal rule), or a dash between two
// links (") - [", the separator in a table of contents).
const emDash = (text: string): RawMatch[] => {
  const isWordChar = (ch: string | undefined): boolean =>
    ch !== undefined && /[\p{L}\p{N}]/u.test(ch)
  const matches: RawMatch[] = []
  for (const match of text.matchAll(/&mdash;|&#8212;|\u2014+/g)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (match[0].startsWith('&')) {
      matches.push({ start, end })
      continue
    }
    const before = start === 0 ? undefined : text[start - 1]
    const after = end >= text.length ? undefined : text[end]
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
    matches.push({ start, end })
  }
  return matches
}

export const rules: RuleDefinition[] = [
  {
    id: 'em-dash',
    label: 'Em dash',
    group: 'voice',
    severity: 'high',
    note: 'The single loudest punctuation tell in machine-written copy.',
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
    scan: matchPhrases([
      'ai-powered',
      'ai powered',
      'revolutionary',
      'next-generation',
      'next generation',
      'cutting-edge',
      'cutting edge',
      'groundbreaking',
      'unparalleled',
      'seamless',
      'seamlessly',
      'game-changing',
      'game changing',
      'game changer',
      'unleash',
      'supercharge',
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
      'empower',
      'effortless',
      'effortlessly',
      'innovative',
      'turnkey',
      'leverage',
      'elevate your',
      'take it to the next level',
      "in today's fast-paced world",
      // Split spellings of listed words. "seam less" and
      // "revo lutionary" are not real phrases, only the listed words
      // with a space in the middle, so they belong to this rule.
      'seam less',
      'revo lutionary',
      'ground breaking',
    ]),
  },
  {
    id: 'ai-tells',
    label: 'AI tell phrases',
    group: 'voice',
    severity: 'medium',
    note: 'Stock phrases that show up in machine-written copy far more often than in human writing.',
    fix: 'Delete the phrase, or say what actually happened.',
    scan: matchPhrases([
      'delve',
      'delves',
      'delving',
      'tapestry',
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
      "it's important to note",
      'it is important to note',
      "in today's digital age",
      'as an ai language model',
      'welcome to the future of work',
      'unlock your potential',
      'join us on this journey',
    ]),
  },
  {
    id: 'ai-adjectives',
    label: 'AI adjectives',
    group: 'voice',
    severity: 'low',
    note: 'Confident adjectives that fill space without adding anything specific.',
    fix: 'Name the specific quality, or delete the word.',
    scan: matchPhrases([
      'crucial',
      'pivotal',
      'foster',
      'fosters',
      'robust',
      'landscape',
    ]),
  },
  {
    id: 'overused-opener',
    label: 'Template opener',
    group: 'voice',
    severity: 'low',
    note: 'An opening move copied from a thousand landing pages.',
    fix: 'Start with the claim itself.',
    scan: matchPhrases([
      "in today's world",
      "in today's fast-paced world",
      'in a world where',
      'imagine a world',
      'ever wondered',
      "we've all been there",
      "let's face it",
      "here's the thing",
      'in an era of',
    ]),
  },
  {
    id: 'not-just',
    label: 'Not just X, but Y',
    group: 'voice',
    severity: 'low',
    note: 'A stock cadence that promises a twist and then repeats itself.',
    fix: 'State the claim once, directly.',
    scan: matchPattern(
      /\bnot\s+(?:just|only)\s+[^.!?\n]{1,48}?(?:,|;|\s)\s*(?:but|it'?s|it\s+is)\b/gi,
    ),
  },
  {
    id: 'hype-punctuation',
    label: 'Hype punctuation',
    group: 'voice',
    severity: 'low',
    note: 'Repeated marks and celebration emoji stand in for emphasis.',
    fix: 'Keep one period and let the sentence carry the weight.',
    scan: matchPattern(
      /[!?]{2,}|[\u{1F525}\u{1F680}\u{2728}\u{1F389}\u{1F4AF}\u{1F60D}\u{1F973}\u{1F64C}\u{1F44F}\u{1F4AA}\u{1F38A}\u{2B50}\u{1F31F}]/gu,
    ),
  },
  {
    id: 'unsourced-number',
    label: 'Unsourced number',
    group: 'claims',
    severity: 'medium',
    note: 'A figure with no source beside it is decoration, not evidence.',
    fix: 'Link the source, or cut the number.',
    scan: unsourcedNumbers,
  },
  {
    id: 'trust-claim',
    label: 'Unverified trust claim',
    group: 'claims',
    severity: 'high',
    note: 'Compliance and security claims are checkable, or they are noise.',
    fix: 'Link the audit, or remove the claim.',
    scan: matchPattern(
      /\b(?:SOC\s?2|ISO\s?27001|GDPR[-\s]?compliant|HIPAA[-\s]?compliant|enterprise[-\s]grade security|bank[-\s]level encryption|military[-\s]grade encryption|100%\s?(?:secure|uptime)|99\.\d+%\s?uptime)\b/gi,
    ),
  },
  {
    id: 'social-proof',
    label: 'Unattributed social proof',
    group: 'claims',
    severity: 'medium',
    note: 'A crowd is claimed, but nobody in it is named or linked.',
    fix: 'Name real customers, or delete the line.',
    scan: matchPhrases([
      'trusted by',
      'loved by',
      'used by',
      'join thousands',
      'join millions',
      'join over',
      'join 10,000',
    ]),
  },
  {
    id: 'testimonial-cliche',
    label: 'Testimonial cliche',
    group: 'claims',
    severity: 'medium',
    note: 'Stock praise reads as invented, even when the quote is real.',
    fix: 'Quote a named customer with a source, or cut the section.',
    scan: matchPhrases([
      'changed my life',
      'life-changing',
      '10x our',
      "best decision we've made",
      "best decision i've made",
      "can't imagine",
      'blown away',
      'a must-have',
    ]),
  },
  {
    id: 'vague-superlative',
    label: 'Vague superlative',
    group: 'claims',
    severity: 'medium',
    note: 'A claim of being the best, with no comparison and no proof.',
    fix: 'Say what is actually better, and compared to what.',
    scan: matchPhrases([
      'best tool',
      'best choice',
      'ultimate choice',
      'ultimate tool',
      'perfect fit',
      'perfect choice',
    ]),
  },
  {
    id: 'generic-cta',
    label: 'Generic call to action',
    group: 'actions',
    severity: 'medium',
    note: 'The label tells you nothing about what happens next.',
    fix: "Name the action: 'Paste your draft', 'See the rules'.",
    scan: matchPhrases([
      'get started',
      'learn more',
      'try now',
      'try it now',
      'explore',
      'discover',
      'click here',
      'read more',
      'sign up today',
      'sign up',
      'sign up to continue',
      'start now',
      'start your free trial',
      'start a free trial',
      'find out more',
      'buy now',
      'subscribe today',
      'subscribe now',
      'subscribe',
      'download it free',
      'download now',
      'download free',
      'download',
      'book a demo',
      'get a quote',
    ]),
  },
  {
    id: 'vague-solution',
    label: 'Vague product noun',
    group: 'actions',
    severity: 'low',
    note: "A 'solution' or 'platform' names no job that anyone needs done.",
    fix: 'Name the specific task the product performs.',
    scan: matchPhrases([
      'solutions',
      'solution for',
      'solutions for',
      'all-in-one',
      'one-stop shop',
      'everything you need',
      'end-to-end',
      'does it all',
    ]),
  },
  {
    id: 'shouting-caps',
    label: 'All-caps shouting',
    group: 'format',
    severity: 'low',
    note: 'Long uppercase runs imitate a poster without earning the volume.',
    fix: 'Use sentence case and let the wording carry the emphasis.',
    scan: shoutingCaps,
  },
]

export const rulesByGroup = (groupId: GroupId) =>
  rules.filter((rule) => rule.group === groupId)
