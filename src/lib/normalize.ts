/**
 * Normalisation for scanning.
 *
 * The rules in rules.ts run on the normalised text, never on the raw
 * draft. Normalisation closes the cheapest evasions: lookalike letters,
 * invisible characters, swapped dashes and underscores used as
 * separators. It never changes what the user sees: every finding is
 * mapped back to its span in the original text through the offset map.
 *
 * The map has one entry per normalised character, plus a sentinel at
 * the end: map[i] is the original index of normalised character i, and
 * map[normalised.length] is the original length. A normalised span
 * [start, end) therefore maps to the original span
 * [map[start], map[end]).
 */

// Characters that are invisible and carry no meaning. Stripped entirely,
// so "seam\u200bless" scans as "seamless".
const ZERO_WIDTH = new Set([
  '\u200b', // zero width space
  '\u200c', // zero width non-joiner
  '\u200d', // zero width joiner
  '\u2060', // word joiner
  '\u2061', // function application (invisible)
  '\u2062', // invisible times
  '\u2063', // invisible separator
  '\u2064', // invisible plus
  '\ufeff', // zero width no-break space
  '\u180e', // Mongolian vowel separator
  '\u00ad', // soft hyphen
])

// Letters from other scripts that look like Latin letters. A Cyrillic
// "а" in "seаmless" is not the letter a, but it reads as one, so it
// scans as one. Only unambiguous lookalikes are mapped.
const HOMOGLYPHS = new Map<string, string>([
  // Cyrillic
  ['а', 'a'],
  ['А', 'A'],
  ['е', 'e'],
  ['Е', 'E'],
  ['о', 'o'],
  ['О', 'O'],
  ['р', 'p'],
  ['Р', 'P'],
  ['с', 'c'],
  ['С', 'C'],
  ['х', 'x'],
  ['Х', 'X'],
  ['у', 'y'],
  ['У', 'Y'],
  ['і', 'i'],
  ['І', 'I'],
  ['ј', 'j'],
  ['Ј', 'J'],
  ['ѕ', 's'],
  ['Ѕ', 'S'],
  ['һ', 'h'],
  ['Һ', 'H'],
  ['ԁ', 'd'],
  ['к', 'k'],
  ['К', 'K'],
  ['м', 'm'],
  ['М', 'M'],
  ['н', 'h'],
  ['Н', 'H'],
  ['т', 't'],
  ['Т', 'T'],
  ['в', 'b'],
  ['В', 'B'],
  ['п', 'n'],
  ['П', 'N'],
  ['з', '3'],
  ['у', 'y'],
  // Greek
  ['α', 'a'],
  ['Α', 'A'],
  ['ε', 'e'],
  ['Ε', 'E'],
  ['ο', 'o'],
  ['Ο', 'O'],
  ['ρ', 'p'],
  ['Ρ', 'P'],
  ['χ', 'x'],
  ['Χ', 'X'],
  ['ν', 'v'],
  ['Ν', 'N'],
  ['ι', 'i'],
  ['Ι', 'I'],
  ['κ', 'k'],
  ['Κ', 'K'],
  ['μ', 'u'],
  ['Μ', 'M'],
  ['η', 'n'],
  ['Η', 'H'],
  ['τ', 't'],
  ['Τ', 'T'],
  ['ς', 's'],
  ['ϲ', 'c'],
  ['Ϲ', 'C'],
  ['Β', 'B'],
  ['Ζ', 'Z'],
  // Latin lookalikes
  ['ɑ', 'a'],
  ['ɡ', 'g'],
  ['ı', 'i'],
  ['ɒ', 'o'],
  ['ʏ', 'y'],
  // Small capital letters. NFKC and NFKD do not fold these, so
  // "sᴇᴀᴍʟᴇss" scans as "seamless" only when they are mapped.
  ['ᴀ', 'a'],
  ['ʙ', 'b'],
  ['ᴄ', 'c'],
  ['ᴅ', 'd'],
  ['ᴇ', 'e'],
  ['ɢ', 'g'],
  ['ʜ', 'h'],
  ['ɪ', 'i'],
  ['ᴊ', 'j'],
  ['ᴋ', 'k'],
  ['ʟ', 'l'],
  ['ᴍ', 'm'],
  ['ɴ', 'n'],
  ['ᴏ', 'o'],
  ['ᴘ', 'p'],
  ['ʀ', 'r'],
  ['ᴛ', 't'],
  ['ᴜ', 'u'],
  ['ᴠ', 'v'],
  ['ᴡ', 'w'],
  ['ᴢ', 'z'],
  // Armenian lookalikes
  ['օ', 'o'],
  ['ո', 'n'],
  ['ս', 'u'],
  // Cyrillic ghe looks like a Latin r in "гevolutionary".
  ['г', 'r'],
  ['Г', 'R'],
])

// Private-use character used for underscores. It acts as a word
// separator for phrase matching ("AI_powered" scans as "AI-powered"),
// but it is not a letter, so the shouting-caps rule treats
// "MAX_RETRIES" as one identifier rather than two shouted words.
export const UNDERSCORE_PLACEHOLDER = '\uE000'

// Dash-like characters. The em dash itself is kept as-is. Any other
// dash is unified to the em dash when it stands alone as a separator
// (" - ", "--", " – "), and kept as a plain hyphen inside a word
// ("AI-powered"), so compound words are not mistaken for pauses.
const DASH_VARIANTS = new Set([
  '\u2010', // hyphen
  '\u2011', // non-breaking hyphen
  '\u2012', // figure dash
  '\u2013', // en dash
  '\u2015', // horizontal bar
  '\u2212', // minus sign
  '\ufe58', // small em dash
  '\ufe63', // small hyphen-minus
  '\uff0d', // fullwidth hyphen-minus
  '-', // hyphen-minus
])

const EM_DASH = '\u2014'

const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[\p{L}\p{N}]/u.test(ch)

const isLetter = (ch: string | undefined): boolean =>
  ch !== undefined && /[\p{L}]/u.test(ch)

// Top-level domains and file extensions that mark the token on either
// side of a period as a domain name or a file name, not an obfuscation
// split: "nextjs.org" and "src/lib/rules.ts" stay whole. The lists are
// deliberately common names only — an unknown suffix is treated as a
// split, because "seam.less" must still fold.
const KNOWN_TLDS = new Set([
  'com', 'org', 'net', 'io', 'dev', 'app', 'co', 'ai', 'me', 'gg', 'xyz',
  'info', 'biz', 'edu', 'gov', 'mil', 'int', 'eu', 'uk', 'de', 'fr', 'it',
  'es', 'nl', 'be', 'ch', 'at', 'jp', 'cn', 'kr', 'in', 'br', 'au', 'ca',
  'us', 'ru', 'ua', 'pl', 'se', 'no', 'dk', 'fi', 'nz', 'za', 'tv', 'cc',
  'fm', 'am', 'sh', 'so', 'ly', 'to', 'tech', 'blog', 'site', 'online',
  'store', 'cloud', 'digital', 'systems', 'network', 'agency', 'studio',
  'works', 'world', 'live', 'news', 'media', 'video', 'music', 'games',
  'social', 'email', 'academy', 'school', 'college', 'health', 'finance',
  'legal', 'law', 'pro', 'name', 'mobi', 'asia', 'aero', 'cat', 'coop',
  'jobs', 'museum', 'post', 'tel', 'travel', 'xxx', 'arpa',
])

// "less" is deliberately NOT here: it is an ordinary English word
// first, and "seam.less" is the canonical obfuscation split — listing
// it as an extension would let the evasion through.
const FILE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'css', 'scss', 'sass',
  'html', 'htm', 'json', 'md', 'markdown', 'py', 'rb', 'go', 'rs', 'java',
  'kt', 'kts', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'php', 'swift', 'pdf',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'txt', 'csv', 'xml',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'sh', 'bash', 'sql', 'lock',
  'log', 'mp3', 'mp4', 'wav', 'mov', 'zip', 'gz', 'tar', 'exe', 'wasm',
  'vue', 'svelte', 'astro', 'env', 'dockerignore', 'gitignore',
])

// Slash compounds that are ordinary English, not obfuscation splits.
const SLASH_CONJUNCTIONS = new Set([
  'and/or', 'input/output', 'client/server', 'true/false', 'on/off',
  'yes/no', 'read/write', 'front/back', 'up/down', 'in/out', 'either/or',
  'he/she', 'his/her', 'day/night', 'win/lose', 'pass/fail', 'north/south',
  'east/west',
])

// One character folded the way normalisation folds it, for comparing
// token text: NFKD, combining marks stripped, lookalikes mapped.
const foldForCheck = (ch: string): string => {
  const folded = ch.normalize('NFKD').replace(/[\p{M}]/gu, '')
  return [...folded].map((c) => HOMOGLYPHS.get(c) ?? c).join('').toLowerCase()
}

const isTokenChar = (ch: string): boolean =>
  isWordChar(ch) || ch === '-' || ch === '.' || ch === '/'

// The maximal run of token characters on one side of position i,
// folded for comparison. Zero-width characters are skipped: they do
// not survive normalisation, so they cannot break a token apart.
const tokenRun = (chars: string[], i: number, dir: -1 | 1): string => {
  let run = ''
  for (let j = i + dir; j >= 0 && j < chars.length; j += dir) {
    const ch = chars[j]
    if (ZERO_WIDTH.has(ch)) continue
    if (!isTokenChar(ch)) break
    run = dir < 0 ? foldForCheck(ch) + run : run + foldForCheck(ch)
  }
  return run
}

// True when the '.' or '/' at chars[i] sits inside a URI, file path,
// or common slash compound, and must be left as-is. The test is
// whether either side forms a known token, not whether the words
// merely look plausible:
// - a dot followed by a known TLD or file extension anywhere in the
//   token ("nextjs.org", "github.com/coldabs/sloppy", "rules.ts");
// - a known slash conjunction ("and/or", "client/server");
// - a multi-segment path ("src/lib/rules").
// A bare two-word split with none of those signals — "seam.less",
// "revo/lutionary", "game.changing" — still folds, which is what
// closes the evasion. Accepted trade-off: a contrived three-segment
// split such as "seam.less/more" is kept whole as a path; the
// single-separator evasion that matters still folds.
const isUriOrCompoundSeparator = (chars: string[], i: number): boolean => {
  const sep = foldForCheck(chars[i])
  const left = tokenRun(chars, i, -1)
  const right = tokenRun(chars, i, 1)
  const combined = `${left}${sep}${right}`

  for (const match of combined.matchAll(/\.([a-z0-9]+)(?=[./-]|$)/g)) {
    if (KNOWN_TLDS.has(match[1]) || FILE_EXTENSIONS.has(match[1])) return true
  }

  if (sep === '/') {
    const leftWord = left.split(/[./-]/).pop() ?? ''
    const rightWord = right.split(/[./-]/)[0] ?? ''
    if (SLASH_CONJUNCTIONS.has(`${leftWord}/${rightWord}`)) return true
  }

  const segments = combined.split(/[./]/)
  if (segments.length >= 3 && combined.includes('/')) return true

  return false
}

// The nearest character that survives normalisation on either side of
// position i. Zero-width characters are stripped before scanning, so a
// dash next to one — "fast\u200b-paced" — has to be judged by the
// letters either side of it, not by the invisible character itself.
const effectivePrev = (chars: string[], i: number): string | undefined => {
  for (let j = i - 1; j >= 0; j -= 1) {
    if (!ZERO_WIDTH.has(chars[j])) return chars[j]
  }
  return undefined
}

const effectiveNext = (chars: string[], i: number): string | undefined => {
  for (let j = i + 1; j < chars.length; j += 1) {
    if (!ZERO_WIDTH.has(chars[j])) return chars[j]
  }
  return undefined
}

// True when the output so far ends at the start of a line: only spaces
// or tabs since the last newline, or nothing at all.
const isLineStart = (out: string[]): boolean => {
  for (let j = out.length - 1; j >= 0; j -= 1) {
    const ch = out[j]
    if (ch === '\n') return true
    if (ch !== ' ' && ch !== '\t') return false
  }
  return true
}

// True when the nearest non-space character before position i is an
// opening bracket or an operator, so a hyphen there is a minus sign.
// Zero-width characters are skipped: they do not survive scanning,
// so they cannot be the character that decides the dash's fate.
const prevNonSpaceIsOperator = (chars: string[], i: number): boolean => {
  for (let j = i - 1; j >= 0; j -= 1) {
    const ch = chars[j]
    if (ch === ' ' || ch === '\t' || ZERO_WIDTH.has(ch)) continue
    return '([{=+*/^,'.includes(ch)
  }
  return false
}

export interface NormalizedText {
  text: string
  map: number[]
}

export const normalizeForScan = (original: string): NormalizedText => {
  const chars = [...original]
  const out: string[] = []
  const map: number[] = []
  let index = 0

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]
    const originalIndex = index
    index += ch.length

    if (ZERO_WIDTH.has(ch)) continue

    // NFKD folds fullwidth letters and digits, ligatures and
    // compatibility forms down to their plain equivalents, and splits
    // accented letters into a base letter plus a combining mark. The
    // marks are stripped, so "délve" scans as "delve" and
    // "seaml\u0065\u0301ss" scans as "seamless".
    const folded = ch.normalize('NFKD').replace(/[\p{M}]/gu, '')
    for (const foldedChar of [...folded]) {
      let mapped = HOMOGLYPHS.get(foldedChar) ?? foldedChar

      if (mapped === EM_DASH) {
        // Keep the em dash itself, whatever surrounds it.
      } else if (DASH_VARIANTS.has(mapped)) {
        // The dash's fate is decided by its surviving neighbours, not
        // by raw characters that normalisation removes.
        const prev = effectivePrev(chars, i)
        const next = effectiveNext(chars, i)
        // A hyphen at the start of a line is a list bullet, not a
        // pause, so it stays a hyphen. A literal em dash at a line
        // start is a different character and is not caught by this
        // branch, so an opening dialogue dash still counts.
        if (isLineStart(out)) {
          mapped = '-'
        } else if (
          // A hyphen right after an opening bracket or an operator,
          // with a word character after it, is a minus sign, not a
          // pause, as in e^(-penalty / 55) or a = -b.
          next !== undefined &&
          isWordChar(next) &&
          prevNonSpaceIsOperator(chars, i)
        ) {
          mapped = '-'
        } else {
          mapped = isWordChar(prev) && isWordChar(next) ? '-' : EM_DASH
        }
      } else if (
        (mapped === '.' || mapped === '/') &&
        isLetter(effectivePrev(chars, i)) &&
        isLetter(effectiveNext(chars, i)) &&
        !isUriOrCompoundSeparator(chars, i)
      ) {
        // A period or slash between two letters is a separator, not
        // punctuation, so "seam.less" scans as "seamless". Digits on
        // either side stay as they are, so "v2.0" and "1.5" are
        // untouched. A separator inside a domain name, file path, or
        // common slash compound ("nextjs.org", "src/lib/rules.ts",
        // "and/or") is left alone — see isUriOrCompoundSeparator.
        mapped = UNDERSCORE_PLACEHOLDER
      } else if (mapped === '_') {
        mapped = UNDERSCORE_PLACEHOLDER
      }

      out.push(mapped)
      map.push(originalIndex)
    }
  }

  map.push(original.length)
  return { text: out.join(''), map }
}
