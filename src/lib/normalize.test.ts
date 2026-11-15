import { describe, expect, it } from 'vitest'
import { analyze, buildMarkedSegments } from './analyzer'
import { normalizeForScan } from './normalize'

describe('normalizeForScan', () => {
  it('folds fullwidth letters to plain ASCII', () => {
    expect(normalizeForScan('ＡＩ-powered').text).toBe('AI-powered')
  })

  it('strips zero-width characters', () => {
    expect(normalizeForScan('seam\u200bless').text).toBe('seamless')
    expect(normalizeForScan('a\u200bb\u200cc').text).toBe('abc')
  })

  it('maps Cyrillic and Greek lookalikes to Latin letters', () => {
    expect(normalizeForScan('se\u0430mless').text).toBe('seamless')
    expect(normalizeForScan('\u03c1latform').text).toBe('platform')
  })

  it('unifies a standalone en dash to an em dash', () => {
    expect(normalizeForScan('Fast, secure \u2013 and local').text).toBe(
      'Fast, secure \u2014 and local',
    )
  })

  it('unifies a standalone hyphen to an em dash', () => {
    expect(normalizeForScan('Fast, secure - and local').text).toBe(
      'Fast, secure \u2014 and local',
    )
  })

  it('keeps a hyphen inside a word as a hyphen', () => {
    expect(normalizeForScan('AI-powered platform').text).toBe(
      'AI-powered platform',
    )
  })

  it('keeps a hyphen at the start of a line as a hyphen, not an em dash', () => {
    expect(normalizeForScan('- First item\n- Second item').text).toBe(
      '- First item\n- Second item',
    )
  })

  it('keeps a minus sign after a bracket or operator as a hyphen', () => {
    expect(normalizeForScan('e^(-penalty / 55)').text).toBe('e^(-penalty / 55)')
    expect(normalizeForScan('a = -b + c').text).toBe('a = -b + c')
  })

  it('turns an underscore into a separator placeholder, not a space', () => {
    const { text } = normalizeForScan('AI_powered')
    expect(text).toBe('AI\uE000powered')
    expect(text).not.toContain('_')
  })

  it('maps findings back to the original text through the offset map', () => {
    // The zero-width space sits inside the matched word. The finding
    // must still highlight the exact original span, zero-width
    // character included.
    const original = 'A seam\u200bless platform.'
    const { text: scanned, map } = normalizeForScan(original)
    expect(scanned).toBe('A seamless platform.')
    const start = scanned.indexOf('seamless')
    const end = start + 'seamless'.length
    expect(original.slice(map[start], map[end])).toBe('seam\u200bless')
    expect(map[scanned.length]).toBe(original.length)
  })

  it('keeps highlighted segments true to the original text', () => {
    const original = 'A se\u0430mless platform.'
    const findings = analyze(original).findings
    const segments = buildMarkedSegments(original, findings)
    expect(segments.map((segment) => segment.text).join('')).toBe(original)
    expect(segments.some((segment) => segment.severity !== null)).toBe(true)
  })
})

describe('normalisation keeps URIs, paths, and slash compounds whole', () => {
  it('leaves domain names intact', () => {
    expect(normalizeForScan('nextjs.org').text).toBe('nextjs.org')
    expect(normalizeForScan('github.com/coldabs/sloppy').text).toBe(
      'github.com/coldabs/sloppy',
    )
    expect(normalizeForScan('Visit https://example.com/pricing today').text).toBe(
      'Visit https://example.com/pricing today',
    )
  })

  it('leaves file paths intact', () => {
    expect(normalizeForScan('src/lib/rules.ts').text).toBe('src/lib/rules.ts')
    expect(normalizeForScan('docs/METHOD.md').text).toBe('docs/METHOD.md')
    expect(normalizeForScan('src/lib/rules').text).toBe('src/lib/rules')
  })

  it('leaves common slash conjunctions intact', () => {
    for (const text of [
      'and/or',
      'input/output',
      'client/server',
      'true/false',
      'on/off',
      'read/write',
    ]) {
      expect(normalizeForScan(text).text, text).toBe(text)
    }
  })

  it('leaves version strings intact', () => {
    expect(normalizeForScan('v2.0').text).toBe('v2.0')
    expect(normalizeForScan('Version 2.0.1 shipped').text).toBe(
      'Version 2.0.1 shipped',
    )
  })

  it('still folds a genuine obfuscation split', () => {
    expect(normalizeForScan('seam.less').text).toBe('seam\uE000less')
    expect(normalizeForScan('revo/lutionary').text).toBe('revo\uE000lutionary')
    expect(normalizeForScan('game.changing').text).toBe('game\uE000changing')
    // An unknown suffix is not a known TLD or extension, so it folds.
    expect(normalizeForScan('word.zzz').text).toBe('word\uE000zzz')
  })

  it('does not flag prose that only mentions a domain, path, or conjunction', () => {
    for (const text of [
      'See the docs at nextjs.org and the code in src/lib/rules.ts.',
      'The input/output ratio and the client/server setup use true/false flags.',
      'Tea and/or coffee is available.',
      'Version v2.0 shipped on time.',
    ]) {
      const result = analyze(text)
      expect(result.score, text).toBe(100)
      expect(result.findings, text).toHaveLength(0)
    }
  })

  it('still catches a buzzword split by a period', () => {
    const ids = analyze('Our seam.less platform ships today.').findings.map(
      (finding) => finding.ruleId,
    )
    expect(ids).toContain('buzzwords')
  })
})

describe('normalisation evasions', () => {
  it('catches a buzzword split across two words', () => {
    const ids = analyze('A seam less work flow, revo lutionary and game changing.')
      .findings.map((finding) => finding.ruleId)
    expect(ids).toContain('buzzwords')
  })

  it('catches a buzzword with a zero-width space inside it', () => {
    const ids = analyze('A seam\u200bless revo\u200blutionary platform.')
      .findings.map((finding) => finding.ruleId)
    expect(ids).toContain('buzzwords')
  })

  it('catches a buzzword written with a Cyrillic lookalike', () => {
    const ids = analyze('A se\u0430mless platform.')
      .findings.map((finding) => finding.ruleId)
    expect(ids).toContain('buzzwords')
  })

  it('catches a buzzword joined by a non-breaking hyphen', () => {
    const ids = analyze('Our AI\u2011powered platform')
      .findings.map((finding) => finding.ruleId)
    expect(ids).toContain('buzzwords')
  })

  it('catches a buzzword joined by an underscore', () => {
    const ids = analyze('Our AI_powered platform')
      .findings.map((finding) => finding.ruleId)
    expect(ids).toContain('buzzwords')
  })

  it('catches a call to action with a zero-width space inside it', () => {
    const ids = analyze('Get\u200b started today')
      .findings.map((finding) => finding.ruleId)
    expect(ids).toContain('generic-cta')
  })

  it('catches an en dash, a double hyphen and a spaced hyphen as em dashes', () => {
    // P2: a single dash is not evidence at any density, so each
    // variant is shown three times in a short draft.
    for (const text of [
      'Fast, secure \u2013 and local. Quick, simple \u2013 and cheap. Bold, bright \u2013 and new.',
      'Fast, secure -- and local. Quick, simple -- and cheap. Bold, bright -- and new.',
      'Fast, secure - and local. Quick, simple - and cheap. Bold, bright - and new.',
    ]) {
      expect(analyze(text).findings.map((finding) => finding.ruleId)).toContain(
        'em-dash',
      )
    }
  })

  it('does not flag a hyphen inside a compound word as an em dash', () => {
    const ids = analyze('AI-powered platform')
      .findings.map((finding) => finding.ruleId)
    expect(ids).not.toContain('em-dash')
    expect(ids).toContain('buzzwords')
  })

  it('catches celebration emoji beyond fire, rocket and sparkle', () => {
    const ids = analyze('Amazing launch! \u{1F389}\u{1F4AF}\u{1F60D} Check it out!')
      .findings.map((finding) => finding.ruleId)
    expect(ids).toContain('hype-punctuation')
  })

  it('does not flag a snake_case identifier as shouting', () => {
    const result = analyze(
      'The API returns JSON over HTTPS. Set the API_KEY in the SDK config before you run the build.',
    )
    expect(result.score).toBe(100)
    expect(result.findings).toHaveLength(0)
  })
})
