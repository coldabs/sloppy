// Claims — numbers, credentials, and praise that arrive without proof.

import {
  SENTENCE_START_WORDS,
  matchPhrases,
  matchPattern,
  sentenceIndexAt,
  sentenceSpans,
  wordsIn,
  type RawMatch,
  type RuleDefinition,
  type SentenceSpan,
} from './common'

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
  spans?: SentenceSpan[],
): boolean => {
  for (const { start: urlStart, raw } of urls) {
    const url = raw.replace(/[),.;:!?]+$/, '')
    // A real evidence link may sit in the sentence after the number —
    // "We grew 500% last year. The full details are in the report at
    // https://example.com/reports/survey-2024" — so when the sentence
    // spans are known, a link whose path names evidence clears a number
    // in its own sentence or the one before it. A pricing or homepage
    // link never clears, wherever it sits.
    if (spans && EVIDENCE_PATH_WORD.test(url)) {
      const numberSentence = sentenceIndexAt(spans, start)
      const urlSentence = sentenceIndexAt(spans, urlStart)
      if (urlSentence - numberSentence === 0 || urlSentence - numberSentence === 1) {
        return true
      }
    }
    if (urlStart < start - CITATION_WINDOW || urlStart > end + CITATION_WINDOW) {
      continue
    }
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
  spans?: SentenceSpan[],
): boolean =>
  hasEvidenceLink(urls, text, start, end, spans) ||
  hasNamedCitation(text, start, end)

// The social-proof phrases, shared by the rule below and by the number
// rules: a number that is the crowd in one of these claims — "Trusted
// by 10,000 teams" — is already flagged by the social-proof rule, so
// the number rules leave it alone instead of charging one claim twice.
// The number has to follow the phrase directly, with only "over",
// "more than", or "about" in between. "Join a million happy readers"
// is not covered: no social-proof phrase matches it, so the number
// still counts on its own.
export const SOCIAL_PROOF_PHRASES = [
  'trusted by',
  'loved by',
  'used by',
  'join thousands',
  'join millions',
  'join over',
  'join 10,000',
  'join the thousands',
  'loved by millions',
  'trusted by millions',
  'used by millions',
  'join the millions',
  'loved by thousands',
  'trusted by thousands',
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

// A reporting sentence measures something instead of selling it:
// "Unemployment increased 2%", "Revenue grew 12% year over year".
// The sentence names a measured subject and a change verb, so its
// percentages are data, not claims — a news or earnings sentence is
// not a selling claim even when it uses a claim verb like "grew".
const REPORTING_SUBJECTS = new Set([
  'unemployment',
  'revenue',
  'revenues',
  'inflation',
  'sales',
  'profit',
  'profits',
  'loss',
  'losses',
  'price',
  'prices',
  'gdp',
  'exports',
  'imports',
  'wages',
  'shares',
  'stock',
  'market',
  'economy',
  'turnout',
  'voters',
  'polling',
  'weather',
  'temperature',
  'rainfall',
  'earnings',
  'income',
  'turnover',
  'demand',
  'supply',
  'interest',
  'rates',
  'mortgage',
  'rent',
  'housing',
  'energy',
  'oil',
  'gas',
  'electricity',
  'crime',
  'births',
  'deaths',
  'population',
  'retail',
  'manufacturing',
  'services',
  'jobs',
  'hiring',
  'layoffs',
  'growth',
])

const CHANGE_VERBS = new Set([
  'increased',
  'increases',
  'increasing',
  'increase',
  'grew',
  'grows',
  'growing',
  'rose',
  'risen',
  'rises',
  'rising',
  'fell',
  'falls',
  'falling',
  'climbed',
  'climbs',
  'climbing',
  'dropped',
  'drops',
  'dropping',
  'reached',
  'reaches',
  'reaching',
  'jumped',
  'jumps',
  'surged',
  'surging',
  'declined',
  'declines',
  'declining',
  'decreased',
  'decreases',
  'decreasing',
  'gained',
  'gains',
  'lost',
  'loses',
])

const isReportingSentence = (
  spans: SentenceSpan[],
  text: string,
  start: number,
): boolean => {
  const index = sentenceIndexAt(spans, start)
  const sentence = spans[index]
  if (!sentence) return false
  const words = wordsIn(text.slice(sentence.start, sentence.end))
  return (
    words.some((word) => REPORTING_SUBJECTS.has(word)) &&
    words.some((word) => CHANGE_VERBS.has(word))
  )
}

// A bare or spelled number only counts as a selling claim when the
// sentence sells: it speaks as the seller (we / our / us), uses a
// selling verb, or puts a boast adjective next to the number ("10,000
// happy users"). "Over a thousand companies across Germany use it
// every day" has none of these, so it stays clean. A number with a
// claim noun but no selling context — a date, a measurement, a plain
// statement — is not a claim.
const SELLING_SIGNALS = new Set([
  'we',
  'our',
  'us',
  'join',
  'trusted',
  'deliver',
  'delivers',
  'serve',
  'serves',
  'offer',
  'offers',
  'provide',
  'provides',
  'guarantee',
  'guarantees',
  'promise',
  'promises',
])

const BOAST_ADJECTIVES = new Set([
  'happy',
  'loyal',
  'dedicated',
  'satisfied',
  'paying',
  'delighted',
  'thrilled',
  'proud',
])

const hasSellingContext = (
  spans: SentenceSpan[],
  text: string,
  start: number,
  end: number,
): boolean => {
  const index = sentenceIndexAt(spans, start)
  const sentence = spans[index]
  if (!sentence) return false
  const bodyWords = wordsIn(text.slice(sentence.start, sentence.end))
  if (bodyWords.some((word) => SELLING_SIGNALS.has(word))) return true
  const rest = text.slice(end, end + 80).split(/[.!?\n]/, 1)[0] ?? ''
  return wordsIn(rest)
    .slice(0, 10)
    .some((word) => BOAST_ADJECTIVES.has(word))
}

// "100% FREE" is a price statement, not a selling claim: the number
// is what the thing costs, not a boast about how many people use it.
const isPriceFree = (text: string, end: number): boolean => {
  const rest = text.slice(end, end + 40).split(/[.!?\n]/, 1)[0] ?? ''
  return wordsIn(rest).slice(0, 3).includes('free')
}

// Hype context: the sentence around a number has to sell something
// before a suffixed figure counts as a claim. A percentage already
// needs claim context, and a bare or spelled number already needs a
// claim noun plus selling context — but a number with a k, m, or b
// suffix had no context gate at all, so "Revenue was $4.2b", "The
// study enrolled 10m participants", and "The fund manages $10m in
// assets" fired as if they were landing-page hype. The gate is the
// seller speaking (we / our / us, a selling verb, a boast
// adjective) or a claim verb in the sentence ("grew to 10m users").
// A claim noun on its own is not enough: "The report lists 10m
// users" is data, not a boast, and stays clean — the same line the
// bare-number branch already draws. The reporting-sentence,
// citation, social-proof, and price-free exemptions all still apply
// first: this gate only adds corroboration, it never removes an
// exemption.
const hasHypeContext = (
  spans: SentenceSpan[],
  text: string,
  start: number,
  end: number,
): boolean => {
  if (hasSellingContext(spans, text, start, end)) return true
  const index = sentenceIndexAt(spans, start)
  const sentence = spans[index]
  if (!sentence) return false
  return wordsIn(text.slice(sentence.start, sentence.end)).some((word) =>
    CLAIM_VERBS.has(word),
  )
}

export const unsourcedNumbers = (text: string): RawMatch[] => {
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
    if (hasCitationNear(urls, text, start, end, spans)) continue
    if (isPartOfSocialProof(spSpans, text, start)) continue
    if (isReportingSentence(spans, text, start)) continue
    if (isPriceFree(text, end)) continue
    if (!hasPercentClaimContext(spans, text, start, end)) continue
    matches.push({ start, end })
  }
  for (const match of text.matchAll(/\b\d[\d,.]*\s?[kmb]\+?\b/gi)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (hasCitationNear(urls, text, start, end, spans)) continue
    if (isPartOfSocialProof(spSpans, text, start)) continue
    if (isReportingSentence(spans, text, start)) continue
    if (!hasHypeContext(spans, text, start, end)) continue
    matches.push({ start, end })
  }
  // A multiplier claim — "10x faster", "10x cheaper" — is a selling
  // claim the same way "500%" is, so it counts even without a claim
  // noun beside it.
  for (const match of text.matchAll(
    /\b\d+x\s+(?:faster|cheaper|better|stronger|quicker|smarter|higher|lower)\b/gi,
  )) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (hasCitationNear(urls, text, start, end, spans)) continue
    matches.push({ start, end })
  }
  matches.push(...bareClaimNumbers(text, urls, spSpans, spans))
  matches.push(...spelledClaimNumbers(text, urls, spSpans, spans))
  return matches.sort((a, b) => a.start - b.start)
}

// A bare number only counts when it is a selling claim: a large, round
// figure about the product — users, customers, growth, accuracy — with
// no source beside it and with selling context in the sentence. A
// number with context stays clean: "the server handled 10,000
// requests", a date, a version, a measurement, a number in a
// reporting sentence ("Revenue grew 12%"), and a price statement
// ("100% FREE"). The threshold is 1,000, so "500 customers" is left
// alone, and a plain four-digit year is never a claim.
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

// True when a claim noun appears within the next ten words of the
// number, before the sentence ends. "10,000 happy users" counts;
// "10,000 requests" does not. Ten words, not five, because a claim
// noun can sit six or more words past the number — "10,000 new users
// who joined this year" — and the window is still short enough that
// a noun from the next claim does not leak in.
const hasClaimNounAfter = (text: string, end: number): boolean => {
  const rest = text.slice(end, end + 80).split(/[.!?\n]/, 1)[0] ?? ''
  const words = wordsIn(rest).slice(0, 10)
  return words.some((word) => CLAIM_NOUNS.has(word))
}

const bareClaimNumbers = (
  text: string,
  urls: FoundUrl[],
  spSpans: RawMatch[],
  spans: SentenceSpan[],
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
    if (!hasSellingContext(spans, text, start, end)) continue
    if (isReportingSentence(spans, text, start)) continue
    if (hasCitationNear(urls, text, start, end, spans)) continue
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
    `\\b(?:${SPELLED_NUMBER_WORD}|a|an)[\\s-]+${SPELLED_MAGNITUDE}\\b`,
    'gi',
  )
  const matches: RawMatch[] = []
  for (const match of text.matchAll(pattern)) {
    const raw = match[0]
    const start = match.index ?? 0
    const end = start + raw.length
    const [leading, magnitude] = raw.toLowerCase().split(/[\s-]+/)
    const value = SPELLED_VALUE[leading] * MAGNITUDE_VALUE[magnitude]
    if (value < 1000) continue
    if (!hasClaimNounAfter(text, end)) continue
    if (!hasSellingContext(spans, text, start, end)) continue
    if (isReportingSentence(spans, text, start)) continue
    if (hasCitationNear(urls, text, start, end, spans)) continue
    if (isPartOfSocialProof(spSpans, text, start)) continue
    matches.push({ start, end })
  }
  // Spelled-out percentages are claims the same way "500%" is: "We
  // grew five hundred percent last year." They need the same claim
  // context as a digit percentage, so "two percent milk" stays clean.
  // Hyphens join the number words the same way spaces do:
  // "five-hundred percent".
  const percentPattern = new RegExp(
    `\\b(?:(?:${SPELLED_NUMBER_WORD})(?:[\\s-]+${SPELLED_MAGNITUDE})?|(?:a|an)[\\s-]+${SPELLED_MAGNITUDE})[\\s-]+percent\\b`,
    'gi',
  )
  for (const match of text.matchAll(percentPattern)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (hasCitationNear(urls, text, start, end, spans)) continue
    if (isPartOfSocialProof(spSpans, text, start)) continue
    if (isReportingSentence(spans, text, start)) continue
    if (isPriceFree(text, end)) continue
    if (!hasPercentClaimContext(spans, text, start, end)) continue
    matches.push({ start, end })
  }
  return matches.sort((a, b) => a.start - b.start)
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

export const FAKE_AUTHORITY_PHRASES = [
  'studies have shown',
  'studies show',
  'studies confirm',
  'research shows',
  'research suggests',
  'research confirms',
  'experts agree',
  'experts say',
  'scientists say',
  'science says',
  'data shows',
  'the data speaks for itself',
  'it is well known',
  'it is widely known',
  'everyone knows',
  'as we all know',
  'history shows',
  'evidence shows',
  'it has been proven',
  'doctors recommend',
]

export const TESTIMONIAL_PHRASES = [
  'changed my life',
  'life-changing',
  '10x our',
  'best decision we\'ve made',
  'best decision i\'ve made',
  'can\'t imagine',
  'blown away',
  'a must-have',
  'game changer for me',
  'changed the game',
  'could not be happier',
  'couldn\'t be happier',
  'highly recommend',
  'worth every penny',
  'best purchase ever',
  'i wish i had found this sooner',
  'total game-changer',
]

export const SUPERLATIVE_PHRASES = [
  'best tool',
  'best choice',
  'ultimate choice',
  'ultimate tool',
  'perfect fit',
  'perfect choice',
  'best in the world',
  'best ever',
  'the very best',
  'number one',
  'number 1',
  'top rated',
  'top-rated',
  'highest rated',
  'most popular',
  "world's best",
  'best thing ever',
]

// Authority claims that gesture at evidence with none attached.
// A claim is cited when a link that looks like evidence, or a named
// publication with a year, sits near it — the same citation test the
// number rules use. The rule fires only when more than half of the
// authority claims in the draft are uncited: one uncited claim in a
// piece that otherwise cites its sources is a miss, not a pattern.
const fakeAuthority = (text: string): RawMatch[] => {
  const urls: FoundUrl[] = [...text.matchAll(URL_GLOBAL)].map((match) => ({
    start: match.index ?? 0,
    raw: match[0],
  }))
  const spans = sentenceSpans(text)
  const claims = matchPhrases(FAKE_AUTHORITY_PHRASES)(text)
  if (claims.length === 0) return []
  const uncited = claims.filter(
    (claim) => !hasCitationNear(urls, text, claim.start, claim.end, spans),
  )
  // A claim is also cited when the sentence names who said it: a
  // capitalised name that is not just a sentence starter. The first
  // word of a sentence is capitalised because it starts the sentence,
  // not because it names anyone, so it never counts.
  const stillUncited = uncited.filter((claim) => {
    const index = sentenceIndexAt(spans, claim.start)
    const sentence = spans[index]
    if (!sentence) return true
    const body = text.slice(sentence.start, sentence.end)
    const names = [...body.matchAll(/\b[A-Z][\p{L}]+/gu)]
      .map((m) => ({ word: m[0], at: m.index ?? 0 }))
      .filter(
        ({ word, at }) =>
          !SENTENCE_START_WORDS.has(word) &&
          body.slice(0, at).trim() !== '',
      )
    return names.length === 0
  })
  // Any uncited claim fires: one made-up authority in a draft of three
  // claims is still a made-up authority. The old rule needed more than
  // half the claims uncited, so a single fake citation in a mostly
  // honest draft slipped through.
  return stillUncited
}

export const claimsRules: RuleDefinition[] = [
  {
    id: 'unsourced-number',
    label: 'Unsourced number',
    group: 'claims',
    severity: 'medium',
    note: 'A figure with no source beside it is decoration, not evidence. That includes a large round number used as a selling claim, such as 10,000 happy users, with or without a percent sign. A percentage only counts when it is a claim — a claim noun or a claim verb nearby — so a plain measurement stays clean. A number with a k, m, or b suffix only counts with hype context — the seller speaking, or a claim verb in the sentence — so "Revenue was $4.2b" and "The study enrolled 10m participants" stay clean. A number in a reporting sentence (unemployment, revenue, inflation with a change verb) is data, not a claim, and a price statement ("100% FREE") is not a claim either. A citation has to be a link that looks like evidence, or a named publication with a year; an evidence link in the next sentence also counts.',
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
    scan: matchPhrases(TESTIMONIAL_PHRASES),
  },
  {
    id: 'vague-superlative',
    label: 'Vague superlative',
    group: 'claims',
    severity: 'medium',
    note: 'A claim of being the best, with no comparison and no proof.',
    fix: 'Say what is actually better, and compared to what.',
    scan: matchPhrases(SUPERLATIVE_PHRASES),
  },
  {
    id: 'fake-authority',
    label: 'Uncited authority claim',
    group: 'claims',
    severity: 'medium',
    note: 'A gesture at evidence with no evidence attached: studies have shown, experts agree, research suggests. A claim that names its source — a link that looks like evidence, a named publication with a year, or the person who said it — is left alone. Any uncited claim fires.',
    fix: 'Name the study, the expert, or the number — or cut the claim.',
    scan: fakeAuthority,
  },
]
