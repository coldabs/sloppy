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

export const HITS_PER_RULE_SCORE_CAP = 2

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
    .join('[\\s-]+')

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

const SOURCE_CUES =
  /\b(?:source|sources|according to|per|report|audit|survey|study|data|https?:|www\.)\b/i

const unsourcedNumbers = (text: string): RawMatch[] => {
  const pattern =
    /\b\d[\d,.]*\s?(?:%|\bpercent\b)|\b\d[\d,.]*\s?[kmb]\+?\b/gi
  const matches: RawMatch[] = []
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const context = text.slice(Math.max(0, start - 90), Math.min(text.length, end + 90))
    if (SOURCE_CUES.test(context)) continue
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
  const pattern = /\b[A-Z][A-Z0-9]{2,}\b/g
  const matches: RawMatch[] = []
  for (const match of text.matchAll(pattern)) {
    if (UPPERCASE_ALLOWLIST.has(match[0])) continue
    const start = match.index ?? 0
    matches.push({ start, end: start + match[0].length })
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
    scan: matchPattern(/\u2014|&mdash;|&#8212;/g),
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
    scan: matchPattern(/[!?]{2,}|[\u{1F525}\u{1F680}\u{2728}]/gu),
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
      'start now',
      'find out more',
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
