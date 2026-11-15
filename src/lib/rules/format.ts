// Format — typographic habits borrowed from templates.

import { UNDERSCORE_PLACEHOLDER } from '../normalize'
import {
  sentenceIndexAt,
  sentenceSpans,
  type RawMatch,
  type RuleDefinition,
} from './common'

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

export const formatRules: RuleDefinition[] = [
  {
    id: 'shouting-caps',
    label: 'All-caps shouting',
    group: 'format',
    severity: 'low',
    note: 'Long uppercase runs imitate a poster without earning the volume. A known acronym such as NASA, one capitalised word alone in a sentence such as FREE shipping, a short all-caps label at the start of a sentence such as FREE SHIPPING on all orders, and a heading in capitals are left alone.',
    fix: 'Use sentence case and let the wording carry the emphasis.',
    scan: shoutingCaps,
  },
]
