import { describe, expect, it } from 'vitest'
import {
  analyze,
  adaptiveFloorWords,
  blendedDensityFactor,
  densityFactor,
  MIN_SCORE_WORDS,
  WINDOW_GLOBAL_WEIGHT,
  WINDOW_PEAK_WEIGHT,
  wordSpans,
} from './analyzer'

// F21 (2026-11-15): the adaptive floor diluted short drafts (a 21-word
// draft was judged as 46 words), a one-word draft scored 48 "Slop
// creeping in", and the peak-window blend let clean filler wash out
// 28.1% of a sloppy passage's density. The floor is now the draft's
// own length (minimum 8, cap 50), drafts under 8 words get a "Too
// short to score" verdict, and the blend is 0.15 global / 0.85 peak.
describe('F21: adaptive floor and too-short verdict', () => {
  it('pins the minimum scorable length', () => {
    expect(MIN_SCORE_WORDS).toBe(8)
  })

  it('judges a draft at its own length', () => {
    expect(adaptiveFloorWords(1)).toBe(8)
    expect(adaptiveFloorWords(21)).toBe(21)
    expect(adaptiveFloorWords(50)).toBe(50)
    expect(adaptiveFloorWords(500)).toBe(50)
  })

  it('gives a one-word draft the too-short verdict, not a band', () => {
    const result = analyze('seamless')
    expect(result.words).toBe(1)
    expect(result.tooShort).toBe(true)
    expect(result.verdict).toBe('Too short to score')
    // The hit is still listed — the verdict is about the score, not
    // the hit.
    expect(result.findings.map((f) => f.ruleId)).toContain('buzzwords')
    expect(result.score).toBe(40)
  })

  it('gives a seven-word draft the too-short verdict', () => {
    const result = analyze('Our seamless platform launches today now really')
    expect(result.words).toBe(7)
    expect(result.tooShort).toBe(true)
    expect(result.verdict).toBe('Too short to score')
  })

  it('scores an eight-word draft normally', () => {
    const result = analyze(
      'Our seamless platform launches today now really soon',
    )
    expect(result.words).toBe(8)
    expect(result.tooShort).toBe(false)
    expect(result.verdict).not.toBe('Too short to score')
  })

  it('does not dilute a single hit with clean words the way the old floor did', () => {
    // One "seamless" plus 20 clean words: the old floor judged 21
    // words as 46 and scored 75; at its own length it scores 59.
    const clean20 =
      'word0 word1 word2 word3 word4 word5 word6 word7 word8 word9 ' +
      'word10 word11 word12 word13 word14 word15 word16 word17 word18 word19.'
    const result = analyze(`seamless ${clean20}`)
    expect(result.words).toBe(21)
    expect(result.score).toBe(59)
  })

  it('leaves an empty draft as "Nothing to score", not too short', () => {
    const result = analyze('')
    expect(result.empty).toBe(true)
    expect(result.tooShort).toBe(false)
    expect(result.verdict).toBe('Nothing to score')
  })

  it('pins the new blend weights', () => {
    expect(WINDOW_GLOBAL_WEIGHT).toBe(0.15)
    expect(WINDOW_PEAK_WEIGHT).toBe(0.85)
  })

  it('holds the peak window against clean filler better than the old blend', () => {
    // Gemini #3's case: 12 hits in the first 100 words. The old
    // 0.35/0.65 blend fell 28.1% (5.4545 -> 3.9205) when 900 clean
    // words were appended; the 0.15/0.85 blend falls 12.0%.
    const hits12 = Array.from({ length: 12 }, (_, i) => ({
      start: i * 10,
      end: i * 10 + 5,
    }))
    const spans100 = wordSpans(
      Array.from({ length: 100 }, (_, i) => `w${i}`).join(' '),
    )
    const spans1000 = wordSpans(
      Array.from({ length: 1000 }, (_, i) => `w${i}`).join(' '),
    )
    const at100 = blendedDensityFactor(hits12, spans100, 100)
    const at1000 = blendedDensityFactor(hits12, spans1000, 1000)
    expect(at100).toBeCloseTo(5.4545, 4)
    expect(at1000).toBeCloseTo(4.7971, 4)
    expect((at100 - at1000) / at100).toBeLessThan(0.15)
    expect(densityFactor(1, 23)).toBeCloseTo(3.0303, 4)
  })
})
