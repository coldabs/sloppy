import { UNDERSCORE_PLACEHOLDER } from './normalize'

export type Severity = 'high' | 'medium' | 'low'
export type GroupId = 'voice' | 'claims' | 'actions' | 'format' | 'structure'

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
  structure: {
    label: 'Structure',
    blurb: 'The shape of the writing: cadence, repetition, and density.',
  },
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const phraseSource = (phrase: string) =>
  phrase
    .trim()
    .split(/\s+/)
    // A `*` in a phrase is one word of any shape, so "unlock your *
    // potential" catches "unlock your full potential" and "unlock your
    // true potential" without listing every adjective in between.
    .map((word) => (word === '*' ? '[^\\s\\-\\u2014\\uE000]+' : escapeRegExp(word)))
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

const sentenceSpans = (text: string): SentenceSpan[] => {
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

const sentenceIndexAt = (spans: SentenceSpan[], position: number): number => {
  for (let i = 0; i < spans.length; i += 1) {
    if (position >= spans[i].start && position < spans[i].end) return i
  }
  return spans.length - 1
}

const wordsIn = (text: string): string[] =>
  text.toLowerCase().split(/[^a-z0-9'’]+/).filter(Boolean)

const countWordsIn = (text: string): number => {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
}

// A number is exempt only with a real citation next to it. The words
// "data" and "per" on their own never count, and neither does a bare
// mention of a report. A citation is either a link that looks like
// evidence, or a named publication together with a year, within 40
// characters of the number. A link to a pricing page, a homepage, or a
// bare domain is not evidence, and neither is "a 2024 report" with no
// outlet named.
const CITATION_WINDOW = 40
const CITATION_YEAR = /\b(?:19|20)\d{2}\b/
const CITATION_PUBLICATION =
  /\b(?:report|study|survey|audit|paper|review|index|ranking)\b/gi

// Words that can appear in a link that points at evidence.
const EVIDENCE_PATH_WORD =
  /\b(?:report|survey|study|audit|paper|research|finding|findings|result|results|census|benchmark|analysis|whitepaper|dataset|data-set|statistics|stats)\b/i
const EVIDENCE_WORD =
  /\b(?:report|survey|study|audit|paper|research|finding|findings|result|results|census|benchmark|analysis|whitepaper)\b/i

// Words that are capitalised only because they start a sentence, not
// because they name anything. A capitalised word counts as a name only
// when it is not one of these.
const SENTENCE_START_WORDS = new Set([
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

// A link counts when it starts within 40 characters of the number.
// The whole text is scanned for links, so a long URL is judged by its
// path in full, not by the part that happens to fall inside a window.
// The link list is computed once per draft and passed in: scanning the
// whole text again for every number would make a long draft quadratic.
const URL_GLOBAL = /https?:\/\/\S+|www\.\S+/gi

export interface FoundUrl {
  start: number
  raw: string
}

const hasEvidenceLink = (
  urls: FoundUrl[],
  text: string,
  start: number,
  end: number,
): boolean => {
  for (const { start: urlStart, raw } of urls) {
    if (urlStart < start - CITATION_WINDOW || urlStart > end + CITATION_WINDOW) {
      continue
    }
    const url = raw.replace(/[),.;:!?]+$/, '')
    if (EVIDENCE_PATH_WORD.test(url)) return true
    const before = text.slice(Math.max(0, urlStart - 40), urlStart)
    const after = text.slice(urlStart + raw.length, urlStart + raw.length + 40)
    if (EVIDENCE_WORD.test(before) || EVIDENCE_WORD.test(after)) return true
  }
  return false
}

// A named publication together with a year: "the 2025 Gartner survey"
// counts, "a 2024 report" does not. The publication word has to start
// within 60 characters of the number — a natural citation sentence
// ("according to the 2024 Gartner report") runs longer than 40 — and
// the year has to sit next to the publication word, with a capitalised
// name within three words before it.
const NAMED_CITATION_WINDOW = 60

const hasNamedCitation = (text: string, start: number, end: number): boolean => {
  const sliceStart = Math.max(0, start - NAMED_CITATION_WINDOW)
  const sliceEnd = Math.min(text.length, end + NAMED_CITATION_WINDOW)
  const slice = text.slice(sliceStart, sliceEnd)
  for (const match of slice.matchAll(CITATION_PUBLICATION)) {
    const pubStart = sliceStart + (match.index ?? 0)
    if (
      pubStart < start - NAMED_CITATION_WINDOW ||
      pubStart > end + NAMED_CITATION_WINDOW
    ) {
      continue
    }
    const nearYear = text.slice(
      Math.max(0, pubStart - 25),
      Math.min(text.length, pubStart + 30),
    )
    if (!CITATION_YEAR.test(nearYear)) continue
    const before = slice.slice(0, match.index ?? 0)
    const words = before.trim().split(/\s+/).filter(Boolean).slice(-3)
    if (
      words.some(
        (word) =>
          /^[A-Z][\w&.'’-]*$/.test(word) && !SENTENCE_START_WORDS.has(word),
      )
    ) {
      return true
    }
  }
  return false
}

const hasCitationNear = (
  urls: FoundUrl[],
  text: string,
  start: number,
  end: number,
): boolean => hasEvidenceLink(urls, text, start, end) || hasNamedCitation(text, start, end)

// The social-proof phrases, shared by the rule below and by the number
// rules: a number that is the crowd in one of these claims — "Trusted
// by 10,000 teams" — is already flagged by the social-proof rule, so
// the number rules leave it alone instead of charging one claim twice.
// The number has to follow the phrase directly, with only "over",
// "more than", or "about" in between. "Join a million happy readers"
// is not covered: no social-proof phrase matches it, so the number
// still counts on its own.
const SOCIAL_PROOF_PHRASES = [
  'trusted by',
  'loved by',
  'used by',
  'join thousands',
  'join millions',
  'join over',
  'join 10,000',
]

const socialProofScan = matchPhrases(SOCIAL_PROOF_PHRASES)

const isPartOfSocialProof = (
  spans: RawMatch[],
  text: string,
  start: number,
): boolean => {
  for (const span of spans) {
    if (span.end > start) continue
    const between = text.slice(span.end, start)
    if (/^\s*(?:over\s+|more\s+than\s+|about\s+)?$/.test(between)) return true
  }
  return false
}

// Verbs and nouns that make a percentage a claim rather than a
// measurement: "We grew 500%", "99.9% uptime". A percentage with none
// of these nearby — "The battery is at 50%." — is a plain statement
// and stays clean.
const CLAIM_VERBS = new Set([
  'grew',
  'grows',
  'growing',
  'growth',
  'increased',
  'increases',
  'increasing',
  'increase',
  'uptime',
  'secure',
  'security',
  'accuracy',
  'accurate',
  'faster',
  'fastest',
  'cheaper',
  'cheapest',
  'saved',
  'saves',
  'saving',
  'retention',
  'conversion',
  'boost',
  'boosts',
  'boosted',
  'guaranteed',
  'guarantee',
  'improved',
  'improves',
  'improvement',
])

const hasPercentClaimContext = (
  spans: SentenceSpan[],
  text: string,
  start: number,
  end: number,
): boolean => {
  if (hasClaimNounAfter(text, end)) return true
  const index = sentenceIndexAt(spans, start)
  const sentence = spans[index]
  if (!sentence) return false
  const body = text.slice(sentence.start, sentence.end)
  return wordsIn(body).some((word) => CLAIM_VERBS.has(word))
}

const unsourcedNumbers = (text: string): RawMatch[] => {
  // The link list, the social-proof spans, and the sentence spans are
  // computed once here and passed down: recomputing any of them for
  // every number would make a long draft quadratic.
  const urls: FoundUrl[] = [...text.matchAll(URL_GLOBAL)].map((match) => ({
    start: match.index ?? 0,
    raw: match[0],
  }))
  const spSpans = socialProofScan(text)
  const spans = sentenceSpans(text)
  const matches: RawMatch[] = []
  for (const match of text.matchAll(/\b\d[\d,.]*\s?(?:%|\bpercent\b)/gi)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (hasCitationNear(urls, text, start, end)) continue
    if (isPartOfSocialProof(spSpans, text, start)) continue
    if (!hasPercentClaimContext(spans, text, start, end)) continue
    matches.push({ start, end })
  }
  for (const match of text.matchAll(/\b\d[\d,.]*\s?[kmb]\+?\b/gi)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (hasCitationNear(urls, text, start, end)) continue
    if (isPartOfSocialProof(spSpans, text, start)) continue
    matches.push({ start, end })
  }
  matches.push(...bareClaimNumbers(text, urls, spSpans))
  matches.push(...spelledClaimNumbers(text, urls, spSpans, spans))
  return matches.sort((a, b) => a.start - b.start)
}

// A bare number only counts when it is a selling claim: a large, round
// figure about the product — users, customers, growth, accuracy — with
// no source beside it. A number with context stays clean: "the server
// handled 10,000 requests", a date, a version, a measurement. The
// threshold is 1,000, so "500 customers" is left alone, and a plain
// four-digit year is never a claim.
const CLAIM_NOUNS = new Set([
  'user',
  'users',
  'customer',
  'customers',
  'team',
  'teams',
  'reader',
  'readers',
  'subscriber',
  'subscribers',
  'download',
  'downloads',
  'install',
  'installs',
  'company',
  'companies',
  'business',
  'businesses',
  'client',
  'clients',
  'member',
  'members',
  'follower',
  'followers',
  'account',
  'accounts',
  'people',
  'organisation',
  'organisations',
  'organization',
  'organizations',
])

const MAGNITUDE_VALUE: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
  million: 1_000_000,
  billion: 1_000_000_000,
}

const SPELLED_VALUE: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

// True when a claim noun appears within the next few words of the
// number, before the sentence ends. "10,000 happy users" counts;
// "10,000 requests" does not.
const hasClaimNounAfter = (text: string, end: number): boolean => {
  const rest = text.slice(end, end + 80).split(/[.!?\n]/, 1)[0] ?? ''
  const words = wordsIn(rest).slice(0, 5)
  return words.some((word) => CLAIM_NOUNS.has(word))
}

const bareClaimNumbers = (
  text: string,
  urls: FoundUrl[],
  spSpans: RawMatch[],
): RawMatch[] => {
  const pattern =
    /\b\d[\d,]*(?:\.\d+)?(?:\s+(?:thousand|million|billion))?\b/gi
  const matches: RawMatch[] = []
  for (const match of text.matchAll(pattern)) {
    const raw = match[0]
    const start = match.index ?? 0
    const end = start + raw.length
    // A number already covered by the percentage pattern, such as
    // "10000%", is one hit, not two.
    if (text[end] === '%') continue
    const afterWord = text.slice(end).match(/^\s*percent\b/i)
    if (afterWord) continue
    const magnitude = raw.match(/(thousand|million|billion)\s*$/i)?.[1].toLowerCase()
    const digits = raw.replace(/,/g, '').replace(/\s+(?:thousand|million|billion)\s*$/i, '')
    const value = Number.parseFloat(digits) * (magnitude ? MAGNITUDE_VALUE[magnitude] : 1)
    if (Number.isNaN(value) || value < 1000) continue
    // A plain four-digit year is a date, not a claim.
    if (!magnitude && !raw.includes(',') && /^\d{4}$/.test(digits)) {
      const year = Number.parseInt(digits, 10)
      if (year >= 1900 && year <= 2099) continue
    }
    if (!hasClaimNounAfter(text, end)) continue
    if (hasCitationNear(urls, text, start, end)) continue
    if (isPartOfSocialProof(spSpans, text, start)) continue
    matches.push({ start, end })
  }
  return matches
}

const SPELLED_NUMBER_WORD =
  '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)'
const SPELLED_MAGNITUDE = '(?:hundred|thousand|million|billion)'

const spelledClaimNumbers = (
  text: string,
  urls: FoundUrl[],
  spSpans: RawMatch[],
  spans: SentenceSpan[],
): RawMatch[] => {
  const pattern = new RegExp(
    `\\b(?:${SPELLED_NUMBER_WORD}|a|an)\\s+${SPELLED_MAGNITUDE}\\b`,
    'gi',
  )
  const matches: RawMatch[] = []
  for (const match of text.matchAll(pattern)) {
    const raw = match[0]
    const start = match.index ?? 0
    const end = start + raw.length
    const [leading, magnitude] = raw.toLowerCase().split(/\s+/)
    const value = SPELLED_VALUE[leading] * MAGNITUDE_VALUE[magnitude]
    if (value < 1000) continue
    if (!hasClaimNounAfter(text, end)) continue
    if (hasCitationNear(urls, text, start, end)) continue
    if (isPartOfSocialProof(spSpans, text, start)) continue
    matches.push({ start, end })
  }
  // Spelled-out percentages are claims the same way "500%" is: "We
  // grew five hundred percent last year." They need the same claim
  // context as a digit percentage, so "two percent milk" stays clean.
  const percentPattern = new RegExp(
    `\\b(?:(?:${SPELLED_NUMBER_WORD})(?:\\s+${SPELLED_MAGNITUDE})?|(?:a|an)\\s+${SPELLED_MAGNITUDE})\\s+percent\\b`,
    'gi',
  )
  for (const match of text.matchAll(percentPattern)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (hasCitationNear(urls, text, start, end)) continue
    if (isPartOfSocialProof(spSpans, text, start)) continue
    if (!hasPercentClaimContext(spans, text, start, end)) continue
    matches.push({ start, end })
  }
  return matches.sort((a, b) => a.start - b.start)
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
  // Government, standards, and well-known organisations. NASA and FBI
  // are names, not shouting.
  'NASA',
  'FBI',
  'CIA',
  'NSA',
  'FDA',
  'CDC',
  'NIH',
  'IRS',
  'SEC',
  'NATO',
  'UNESCO',
  'UNICEF',
  'WHO',
  'FEMA',
  'EPA',
  'FAA',
  'FTC',
  'FCC',
  'DOE',
  'DOD',
  'NOAA',
  'NIST',
  'IEEE',
  'ACM',
  'IEC',
  'ITU',
  'IETF',
  'W3C',
  'DOI',
  'ISBN',
  'ISSN',
  'GNU',
  'BSD',
  'POSIX',
  'REST',
  'SOAP',
  'XML',
  'YAML',
  'TOML',
  'SVG',
  'PNG',
  'JPG',
  'JPEG',
  'GIF',
  'MP3',
  'MP4',
  'ZIP',
  'TAR',
  'GZ',
  'MD',
  'TXT',
  'LOG',
  'BIN',
  'EXE',
  'DLL',
  'DMG',
  'DEB',
  'RPM',
  'APK',
  'IPA',
  'IDE',
  'VCS',
  'CI',
  'CD',
  'QA',
  'UAT',
  'SLA',
  'SOW',
  'RFP',
  'RFQ',
  'PO',
  'SKU',
  'UPC',
  'EAN',
  'VAT',
  'GST',
  'APR',
  'APY',
  'IRA',
  'HSA',
  'FSA',
  'PTO',
  'WFH',
  'OOO',
  'ETA',
  'EOD',
  'TBD',
  'TBC',
  'BRB',
  'LOL',
  'OMG',
  'BTW',
  'IMO',
  'IMHO',
  'TLDR',
  'AMA',
  'TIL',
  'YOLO',
  'FOMO',
  'GOAT',
  'OKR',
  'SWOT',
  'PEST',
  'SMART',
  'RACI',
  'MOM',
  'YOY',
  'QOQ',
  'MTD',
  'YTD',
  'III',
  'GPS',
  'SMS',
  'LED',
  'OLED',
  'HDMI',
  'USB',
  'SIM',
  'PIN',
  'OTP',
  'VIP',
  'RSVP',
  'DIY',
  'BBC',
  'CNN',
  'MIT',
  'DHL',
  'UPS',
])

const shoutingCaps = (text: string): RawMatch[] => {
  // A caps run counts only when it stands on its own. An underscore
  // placeholder on either side means the run is part of a snake_case
  // identifier such as MAX_RETRIES, not a shouted word.
  const pattern = new RegExp(
    `(?<![\\w${UNDERSCORE_PLACEHOLDER}])[A-Z][A-Z0-9]{2,}(?![\\w${UNDERSCORE_PLACEHOLDER}])`,
    'g',
  )
  const raw: RawMatch[] = []
  for (const match of text.matchAll(pattern)) {
    if (UPPERCASE_ALLOWLIST.has(match[0])) continue
    const start = match.index ?? 0
    raw.push({ start, end: start + match[0].length })
  }
  const spans = sentenceSpans(text)
  return raw.filter((match) => {
    // A whole line of capitalised words with no sentence terminator is
    // a heading, not shouting: INTRODUCTION, GETTING STARTED, CHAPTER
    // ONE. A shouted sentence such as SALE ENDS TODAY. keeps its
    // period, so it is not exempt. Markdown heading markers are not
    // words, so "## GET STARTED" counts as a heading too.
    const lineStart = text.lastIndexOf('\n', match.start - 1) + 1
    const nextNewline = text.indexOf('\n', match.end)
    const lineEnd = nextNewline === -1 ? text.length : nextNewline
    const line = text.slice(lineStart, lineEnd).trim().replace(/^#+\s*/, '')
    if (!/[.!?]/.test(line)) {
      const words = line.split(/\s+/).filter(Boolean)
      if (
        words.length >= 1 &&
        words.length <= 4 &&
        words.every((word) => /^[A-Z0-9][A-Z0-9'’\-:]*$/.test(word))
      ) {
        return false
      }
    }
    // One capitalised word alone in an otherwise normal sentence is
    // emphasis or a label, not shouting: FREE shipping, a single
    // WARNING. The same word twice, as in a markdown link
    // [LICENSE](LICENSE), still counts as one word. Sustained
    // capitals — two or more different runs in one sentence — still
    // count.
    const sentenceIndex = sentenceIndexAt(spans, match.start)
    const sentence = spans[sentenceIndex]
    if (sentence) {
      const inSentence = raw.filter(
        (other) => other.start >= sentence.start && other.start < sentence.end,
      )
      const distinct = new Set(
        inSentence.map((other) => text.slice(other.start, other.end)),
      )
      if (distinct.size === 1) return false
      // A short all-caps label at the start of a sentence is a label,
      // not shouting: "FREE SHIPPING on all orders." The capitals have
      // to be a prefix of at most three words, with lowercase text
      // after them. A sentence that is all capitals, such as "SALE
      // ENDS TODAY.", still counts. A caps run inside a fenced code
      // block or a table row sits outside every sentence span, so
      // there is no sentence to judge it against, and it is left to
      // the rule above.
      if (inSentence.length > 0) {
        const allPrefix = inSentence.every((other) => {
          const before = text.slice(sentence.start, other.start)
          return before.trim().split(/\s+/).filter(Boolean).length <= 2
        })
        if (allPrefix) {
          const last = inSentence[inSentence.length - 1]
          const after = text.slice(last.end, sentence.end)
          if (/[a-z]/.test(after)) return false
        }
      }
    }
    return true
  })
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

// The "not just X, but Y" cadence is matched at sentence level, not
// against a fixed character count. The old rule stopped at 48
// characters, so a realistic long clause escaped it. The twist has to
// sit in the same sentence as the setup: "Not just the speed. It's
// about trust." is two sentences and does not count. One exception: a
// twist on the next line still belongs to the setup when the setup
// line ends with a comma — "Not just a tool,\nbut a partner." "Yet"
// counts as a twist too: "Not just a tool, yet a whole new way of
// working."
const notJust = (text: string): RawMatch[] => {
  const pattern = /\bnot\s+(?:just|only)\b[\s\S]*?\b(?:but|yet|it'?s|it\s+is)\b/gi
  const matches: RawMatch[] = []
  const spans = sentenceSpans(text)
  for (let i = 0; i < spans.length; i += 1) {
    const sentence = spans[i]
    let body = text.slice(sentence.start, sentence.end)
    if (/,\s*$/.test(body) && i + 1 < spans.length) {
      body += '\n' + text.slice(spans[i + 1].start, spans[i + 1].end)
    }
    for (const match of body.matchAll(pattern)) {
      const start = sentence.start + (match.index ?? 0)
      matches.push({ start, end: start + match[0].length })
    }
  }
  return matches
}

// Words that make "explore" and "discover" documentation navigation
// rather than a sales button: Explore the codebase, Explore the API.
const DOCS_NOUNS = new Set([
  'codebase',
  'code',
  'docs',
  'documentation',
  'repository',
  'repo',
  'api',
  'reference',
  'examples',
  'example',
  'source',
  'guide',
  'contributing',
  'changelog',
  'readme',
  'tutorial',
  'handbook',
  'wiki',
  'sdk',
  'cli',
])

// A "get started" that is followed by a command is an instruction,
// not a sales button: "To get started, run npm install."
const CODE_COMMAND =
  /\b(?:npm|yarn|pnpm|pip|bun)\s+(?:install|run|start|build|test|add|init)\b|\brun\s+(?:npm|yarn|node|docker|git|npx)\b|\bgit\s+clone\b/i

const genericCta = (text: string): RawMatch[] => {
  const base = matchPhrases([
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
  ])(text)
  const spans = sentenceSpans(text)
  return base.filter((match) => {
    const matched = text.slice(match.start, match.end).toLowerCase()
    // A call to action on a heading line is a label, not sales copy in
    // a paragraph: a markdown heading ("## GET STARTED") or a short
    // line of capitalised words with no sentence terminator ("GET
    // STARTED"). A mixed-case line with no terminator, such as "Get
    // started today", is still a call to action, not a heading, so it
    // is not exempt. A real sentence keeps its period, so it is not
    // exempt either.
    const lineStart = text.lastIndexOf('\n', match.start - 1) + 1
    const nextNewline = text.indexOf('\n', match.end)
    const lineEnd = nextNewline === -1 ? text.length : nextNewline
    const line = text.slice(lineStart, lineEnd).trim()
    const lineWords = line.split(/\s+/).filter(Boolean)
    const headingLine =
      !/[.!?]/.test(line) &&
      (/^#+\s/.test(line) ||
        (lineWords.length >= 1 &&
          lineWords.length <= 5 &&
          lineWords.every((word) => /^[A-Z0-9][A-Z0-9'’\-:]*$/.test(word))))
    if (headingLine) return false
    const sentenceIndex = sentenceIndexAt(spans, match.start)
    const sentence = spans[sentenceIndex]
    if (!sentence) return true
    const body = text.slice(sentence.start, sentence.end)
    if (
      matched === 'explore' ||
      matched === 'discover' ||
      matched === 'learn more' ||
      matched === 'click here'
    ) {
      const after = body.slice(match.end - sentence.start)
      const words = wordsIn(after).slice(0, 4)
      if (words.some((word) => DOCS_NOUNS.has(word))) return false
    }
    if (matched === 'get started' && CODE_COMMAND.test(body)) return false
    return true
  })
}

// Words that make "solutions" a maths term rather than a product noun:
// "Find all solutions to the equation." The check looks at the
// sentence itself and the one before it, so "There are two solutions."
// in the sentence after the equation is covered too.
const MATH_WORDS = new Set([
  'equation',
  'solve',
  'solves',
  'solving',
  'solved',
  'proof',
  'theorem',
  'derivative',
  'integral',
  'matrix',
  'matrices',
  'polynomial',
  'variable',
  'function',
  'calculate',
  'calculates',
  'algebra',
  'calculus',
  'geometry',
  'arithmetic',
  'formula',
  'compute',
  'computes',
])

const vagueSolution = (text: string): RawMatch[] => {
  const base = matchPhrases([
    'solutions',
    'solution for',
    'solutions for',
    'all-in-one',
    'one-stop shop',
    'everything you need',
    'end-to-end',
    'does it all',
  ])(text)
  const spans = sentenceSpans(text)
  return base.filter((match) => {
    if (!text.slice(match.start, match.end).toLowerCase().includes('solution')) {
      return true
    }
    const sentenceIndex = sentenceIndexAt(spans, match.start)
    for (const index of [sentenceIndex, sentenceIndex - 1]) {
      if (index < 0 || index >= spans.length) continue
      const body = text.slice(spans[index].start, spans[index].end)
      if (wordsIn(body).some((word) => MATH_WORDS.has(word))) return false
    }
    return true
  })
}

// Words that show a nearby link is an audit, not just any link: the
// claim is exempt only when the link and the audit language sit in the
// same sentence. A pricing link does not clear a compliance claim.
const AUDIT_WORDS = /\b(?:audit|report|certification|certificate|compliance|verified|attestation|assessment)\b/i
const URL_PATTERN = /https?:\/\/\S+|www\.\S+/i

const trustClaim = (text: string): RawMatch[] => {
  const base = matchPattern(
    /\b(?:SOC\s?2|ISO\s?27001|GDPR[-\s]?compliant|HIPAA[-\s]?compliant|enterprise[-\s]grade security|bank[-\s]level encryption|military[-\s]grade encryption|100%\s?(?:secure|uptime)|99\.\d+%\s?uptime)\b/gi,
  )(text)
  const spans = sentenceSpans(text)
  return base.filter((match) => {
    const sentenceIndex = sentenceIndexAt(spans, match.start)
    for (const index of [sentenceIndex, sentenceIndex + 1]) {
      if (index < 0 || index >= spans.length) continue
      const body = text.slice(spans[index].start, spans[index].end)
      if (URL_PATTERN.test(body) && AUDIT_WORDS.test(body)) return false
    }
    return true
  })
}

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
  const sentences = sentenceSpans(text).map((span) => ({
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
// row is a cadence.
const repeatedOpenings = (text: string): RawMatch[] => {
  const sentences = sentenceSpans(text).map((span) => {
    const words = wordsIn(text.slice(span.start, span.end))
    return { ...span, opening: words.slice(0, 2).join(' '), words: words.length }
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
    if (sentence.words < 3 || sentence.opening === '') {
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

export const rules: RuleDefinition[] = [
  {
    id: 'em-dash',
    label: 'Em dash',
    group: 'voice',
    severity: 'high',
    note: 'The single loudest punctuation tell in machine-written copy. A pair of dashes that opens and closes one interruption counts once, not twice.',
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
      'worth noting',
      'dive into',
      "in today's digital age",
      'as an ai language model',
      'welcome to the future of work',
      'unlock your potential',
      'unlock your * potential',
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
      "in today's online world",
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
    note: 'A stock cadence that promises a twist and then repeats itself. The twist has to sit in the same sentence, however long the clause is — or on the next line, when the setup line ends with a comma. "Yet" counts as a twist too.',
    fix: 'State the claim once, directly.',
    scan: notJust,
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
    note: 'A figure with no source beside it is decoration, not evidence. That includes a large round number used as a selling claim, such as 10,000 happy users, with or without a percent sign. A percentage only counts when it is a claim — a claim noun or a claim verb nearby — so a plain measurement stays clean. A citation has to be a link that looks like evidence, or a named publication with a year.',
    fix: 'Link the source, or cut the number.',
    scan: unsourcedNumbers,
  },
  {
    id: 'trust-claim',
    label: 'Unverified trust claim',
    group: 'claims',
    severity: 'high',
    note: 'Compliance and security claims are checkable, or they are noise. A claim that links its audit in the same sentence, or the one after it, is left alone.',
    fix: 'Link the audit, or remove the claim.',
    scan: trustClaim,
  },
  {
    id: 'social-proof',
    label: 'Unattributed social proof',
    group: 'claims',
    severity: 'medium',
    note: 'A crowd is claimed, but nobody in it is named or linked.',
    fix: 'Name real customers, or delete the line.',
    scan: matchPhrases(SOCIAL_PROOF_PHRASES),
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
    note: 'The label tells you nothing about what happens next. "Explore the codebase" and "To get started, run npm install" are instructions, not sales buttons, and are left alone — as are "Learn more" and "Click here" when they point at the documentation, and a call to action that sits on a heading line.',
    fix: "Name the action: 'Paste your draft', 'See the rules'.",
    scan: genericCta,
  },
  {
    id: 'vague-solution',
    label: 'Vague product noun',
    group: 'actions',
    severity: 'low',
    note: "A 'solution' or 'platform' names no job that anyone needs done. The word in a maths sentence, such as 'solutions to the equation', is left alone.",
    fix: 'Name the specific task the product performs.',
    scan: vagueSolution,
  },
  {
    id: 'shouting-caps',
    label: 'All-caps shouting',
    group: 'format',
    severity: 'low',
    note: 'Long uppercase runs imitate a poster without earning the volume. A known acronym such as NASA, one capitalised word alone in a sentence such as FREE shipping, a short all-caps label at the start of a sentence such as FREE SHIPPING on all orders, and a heading in capitals are left alone.',
    fix: 'Use sentence case and let the wording carry the emphasis.',
    scan: shoutingCaps,
  },
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
    note: 'Three or more sentences in a row that open with the same two words.',
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
]

export const rulesByGroup = (groupId: GroupId) =>
  rules.filter((rule) => rule.group === groupId)
