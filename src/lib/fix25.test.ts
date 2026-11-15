import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'

// F25 (2026-11-15): a 15/21-word sentence alternation bypassed both
// burstiness (CV 0.167, above the 0.12 threshold) and
// same-length-sentences (spread 6), and when burstiness or low-TTR
// did fire the excerpt was the entire document. The alternation is
// a pattern-detection gap, not a threshold gap — the threshold is
// not widened (clean human text measures CV 0.17–0.35). The spans
// are now the flat run's sentence range and the lowest-MATTR window.
describe('F25: burstiness alternation and localised excerpts', () => {
  // Sentences of exactly N words, each word unique across the text.
  const makeSentences = (lengths: number[]): string => {
    let n = 0
    return lengths
      .map((len) =>
        Array.from({ length: len }, () => `word${n++}`).join(' ') + '.',
      )
      .join(' ')
  }

  it('flags a 15/21-word alternation that the CV misses', () => {
    const text = makeSentences([15, 21, 15, 21, 15, 21, 15, 21, 15, 21])
    const result = analyze(text)
    expect(result.findings.map((f) => f.ruleId)).toContain('burstiness')
    // Was 100 (completely silent); the rigid cadence is caught.
    expect(result.score).toBe(83)
  })

  it('does not flag a varied rhythm', () => {
    const text = makeSentences([6, 11, 17, 9, 14, 20, 8, 13, 19, 7])
    expect(analyze(text).findings.map((f) => f.ruleId)).not.toContain(
      'burstiness',
    )
  })

  it('does not flag a short alternation', () => {
    // Four alternating sentences are not a sustained pattern.
    const text = makeSentences([15, 21, 15, 21, 6, 11, 17, 9, 14, 20])
    expect(analyze(text).findings.map((f) => f.ruleId)).not.toContain(
      'burstiness',
    )
  })

  it('locates the burstiness excerpt on the flat run, not the whole document', () => {
    // 10 uniform 18-word sentences plus one 25-word outlier: the CV
    // fires (0.104), but the flat run is only the 10 uniform ones.
    const text = makeSentences([...Array(10).fill(18), 25])
    const result = analyze(text)
    const finding = result.findings.find((f) => f.ruleId === 'burstiness')
    expect(finding).toBeDefined()
    expect(finding?.excerpt).not.toContain('word200')
    expect(finding?.excerpt.length).toBeLessThan(text.length)
  })

  it('locates the low-ttr excerpt on the lowest-MATTR window', () => {
    // 10 varied sentences, then 15 identical short ones: the
    // repetitive passage is at the end, not the whole document.
    const text =
      makeSentences([6, 11, 17, 9, 14, 20, 8, 13, 19, 7]) +
      ' ' +
      Array.from(
        { length: 15 },
        () => 'The team builds the product and the team ships the product.',
      ).join(' ')
    const result = analyze(text)
    const finding = result.findings.find((f) => f.ruleId === 'low-ttr')
    expect(finding).toBeDefined()
    expect(finding?.excerpt.length).toBeLessThan(text.length)
    expect(finding?.excerpt).toContain('The team builds the product')
  })

  it('still returns the whole document when the whole text is the signal', () => {
    // 10 uniform 18-word sentences: the flat run is the whole text,
    // so the excerpt is the whole text — and that is correct.
    const text = makeSentences(Array(10).fill(18))
    const result = analyze(text)
    const finding = result.findings.find((f) => f.ruleId === 'burstiness')
    expect(finding).toBeDefined()
    expect(finding?.excerpt.length).toBeGreaterThanOrEqual(text.length - 40)
  })
})
