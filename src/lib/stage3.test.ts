// Stage 3 — sliding-window peak scoring, adaptive floor, and the
// sentence-level co-occurrence multiplier (AUDIT.md §7 stage 3).
// Scores changed by design here: short slop scores lower than under
// the flat 50-word floor, and a sloppy passage padded with clean
// filler scores far lower than under global-only density. Every
// number below was measured from the new code, not carried over.
import { describe, expect, it } from 'vitest'
import {
  COOCCURRENCE_MIN_GROUPS,
  COOCCURRENCE_MULTIPLIER,
  WINDOW_GLOBAL_WEIGHT,
  WINDOW_PEAK_WEIGHT,
  WINDOW_STEP_WORDS,
  WINDOW_WORDS,
  adaptiveFloorWords,
  analyze,
  densityFactor,
  peakWindowDensityFactor,
  wordSpans,
} from './analyzer'

// The audit's hero shape: a sloppy 49-word hero section. Appending
// ~1,000 clean words used to wash it out (score 9 -> 79, penalty
// 133.53 -> 12.98, a 90.3% penalty dilution); the peak window holds
// the hero's density, so the padded version now scores 25 (F21: the
// floor is the draft's own length, so the hero penalty is 135.09,
// and the 0.15/0.85 blend holds the padded penalty at 76.13).
const HERO =
  'Revolutionary AI-powered platform with military-grade encryption. ' +
  'Our next-generation technology will supercharge your workflow and leverage synergies across your whole team. ' +
  'Seamless, cutting-edge, groundbreaking — trusted by thousands of teams worldwide. ' +
  'World-class security changes the game for every business. ' +
  'Unlock your potential with our transformative solution today. Get started now!'

// Clean filler: unique words in varied-length sentences, following a
// fixed length pattern with no four-in-a-row within one word, so no
// rule fires on the filler itself (it scores 100 alone).
const LENGTH_PATTERN = [6, 11, 17, 9, 14, 20, 8, 13, 19, 7, 12, 18, 10, 15, 21, 5]
const cleanFiller = (targetWords: number): string => {
  const sentences: string[] = []
  let words = 0
  let n = 0
  let s = 0
  while (words < targetWords) {
    const len = LENGTH_PATTERN[s++ % LENGTH_PATTERN.length]
    const ws: string[] = []
    for (let i = 0; i < len; i++) ws.push(`word${n++}`)
    sentences.push(ws.join(' ') + '.')
    words += len
  }
  return sentences.join(' ')
}

describe('stage 3: adaptive floor', () => {
  it('scales from 8 up to the 50-word cap', () => {
    // F21 (2026-11-15): the floor is the draft's own length, minimum
    // MIN_SCORE_WORDS (8), cap 50. The old floor inflated a 21-word
    // draft to 46 words, so adding clean words washed a single hit out.
    expect(adaptiveFloorWords(0)).toBe(1)
    expect(adaptiveFloorWords(1)).toBe(8)
    expect(adaptiveFloorWords(5)).toBe(8)
    expect(adaptiveFloorWords(6)).toBe(8)
    expect(adaptiveFloorWords(22)).toBe(22)
    expect(adaptiveFloorWords(23)).toBe(23)
    expect(adaptiveFloorWords(50)).toBe(50)
    expect(adaptiveFloorWords(500)).toBe(50)
  })

  it('scores a one-word buzzword draft far below the old floor score', () => {
    // The flat 50-word floor scored "seamless" 76 ("Mostly clean").
    // F21 (2026-11-15): one word is judged as 8 words, so the single
    // medium hit costs a 50.00 penalty and scores 40 — but the verdict
    // is "Too short to score": one listed word is not a sloppy draft,
    // and the number is not meaningful.
    const result = analyze('seamless')
    expect(result.score).toBe(40)
    expect(result.penalty).toBeCloseTo(50.0, 2)
    expect(result.tooShort).toBe(true)
    expect(result.verdict).toBe('Too short to score')
  })

  it('scores short taglines at the minimum, not as 50 words', () => {
    // F21 (2026-11-15): a 5- or 6-word tagline is judged as 8 words
    // (the minimum), not 50 — and both are under MIN_SCORE_WORDS, so
    // the verdict is "Too short to score", not a band.
    const five = analyze('Our seamless platform launches today')
    const six = analyze('Our seamless platform launches today now')
    expect(five.score).toBe(40)
    expect(five.verdict).toBe('Too short to score')
    expect(six.score).toBe(40)
    expect(six.verdict).toBe('Too short to score')
  })

  it('caps the floor at 50 words for long drafts', () => {
    // F21 (2026-11-15): at 23 words the floor is 23 (the draft's own
    // length), so one hit per 23 words is a 3.0303 factor. At and
    // above the 50-word cap the density factor is the old one: one
    // hit per 50 words is 1.6667, one per 100 words is 0.9091.
    expect(densityFactor(1, 23)).toBeCloseTo(3.0303, 4)
    expect(densityFactor(1, 50)).toBeCloseTo(1.6667, 4)
    expect(densityFactor(1, 100)).toBeCloseTo(0.9091, 4)
  })
})

describe('stage 3: sliding-window peak scoring', () => {
  it('pins the window constants', () => {
    expect(WINDOW_WORDS).toBe(100)
    expect(WINDOW_STEP_WORDS).toBe(25)
    // F21 (2026-11-15): the peak carries more of the blend, so a
    // sloppy passage is washed out less by clean filler (the 12-hit
    // dilution falls from 28.1% to 12.0%).
    expect(WINDOW_GLOBAL_WEIGHT).toBe(0.15)
    expect(WINDOW_PEAK_WEIGHT).toBe(0.85)
  })

  it('holds the peak window when a sloppy hero is padded with clean words', () => {
    const hero = analyze(HERO)
    const filler = cleanFiller(1000)
    expect(analyze(filler).score).toBe(100)
    const padded = analyze(HERO + ' ' + filler)
    // Same 16 hits in both. Before stage 3 the penalty fell 90.3%
    // (133.53 -> 12.98) and the score rose 9 -> 79; now the worst
    // 100-word window carries the hero, so the penalty falls only
    // 43.6% (135.09 -> 76.13) and the score rises 9 -> 25 — still
    // Heavy slop, not Mostly clean. (F21: the hero penalty is 135.09
    // because the floor is the draft's own 49 words, and the 0.15 /
    // 0.85 blend holds the padded penalty higher than the old 61.27.)
    expect(hero.score).toBe(9)
    expect(hero.penalty).toBeCloseTo(135.09, 2)
    expect(padded.hits).toBe(hero.hits)
    expect(padded.penalty).toBeCloseTo(76.13, 2)
    expect(padded.score).toBe(25)
    expect((hero.penalty - padded.penalty) / hero.penalty).toBeLessThan(0.6)
  })

  it('evaluates the final partial window instead of dropping the tail', () => {
    // 130 words, 4 hits in the last 4 words. A loop that stops at
    // totalWords - WINDOW_WORDS never opens a window covering them
    // and reports a peak of 0; the fixed loop opens a window at word
    // 125 and sees all 4.
    const text = Array.from({ length: 130 }, (_, i) => `word${i}`).join(' ')
    const spans = wordSpans(text)
    const tail = { start: spans[126].start, end: spans[129].end }
    expect(peakWindowDensityFactor([tail], spans)).toBeCloseTo(
      densityFactor(1, WINDOW_WORDS),
      10,
    )
    // One hit anywhere in a 100-word window is one hit per 100 words.
    const head = { start: spans[0].start, end: spans[0].end }
    expect(peakWindowDensityFactor([head], spans)).toBe(
      peakWindowDensityFactor([tail], spans),
    )
  })

  it('counts a match that straddles a window boundary', () => {
    // A match spanning words 50-160 is longer than any 100-word
    // window, so a fully-contained check counts it nowhere. Overlap
    // counts it in every window it touches, so the peak is one hit
    // per 100 words, not zero.
    const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ')
    const spans = wordSpans(text)
    const long = { start: spans[50].start, end: spans[160].end }
    expect(peakWindowDensityFactor([long], spans)).toBeCloseTo(
      densityFactor(1, WINDOW_WORDS),
      10,
    )
    expect(peakWindowDensityFactor([long], spans)).toBeGreaterThan(0)
    // And a short match sitting across the 100-word boundary is
    // counted in the window it starts in, not dropped for crossing it.
    const straddle = { start: spans[99].start, end: spans[100].end }
    expect(peakWindowDensityFactor([straddle], spans)).toBeCloseTo(
      densityFactor(1, WINDOW_WORDS),
      10,
    )
  })

  it('is the global density for drafts of 100 words or fewer', () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')
    const spans = wordSpans(text)
    const match = { start: spans[10].start, end: spans[12].end }
    expect(peakWindowDensityFactor([match], spans)).toBe(
      densityFactor(1, 60),
    )
  })

  it('added words change the score only by density, never by clearing a hit', () => {
    // The fake-citation shape from HEAD-TO-HEAD.md, at 28 words. The
    // citation sits two sentences away from every number, so no hit
    // is cleared by it: same 4 findings in both. F21 (2026-11-15):
    // the floor is now the draft's own length (28 -> 38 words), so
    // the longer draft is honestly less dense and scores higher
    // (21 -> 28) — the old version of this test pinned identical
    // scores because both versions were capped at a 50-word floor.
    const base =
      'Our platform delivers 99.9% uptime and serves 10,000 happy users every single day. We grew 500% last year and our accuracy is 99% across every region we serve.'
    const cited =
      base +
      ' The report is long and detailed. See https://example.com/pricing for details.'
    const baseResult = analyze(base)
    const citedResult = analyze(cited)
    expect(baseResult.score).toBe(21)
    expect(citedResult.score).toBe(28)
    expect(citedResult.penalty).toBeLessThan(baseResult.penalty)
    expect(citedResult.findings).toHaveLength(baseResult.findings.length)
    expect(citedResult.findings).toHaveLength(4)
  })

  it('does not let a fake citation clear a hit', () => {
    // The 20-word base scores 15 and the 29-word cited version 22.
    // The rise is the density change alone (the floor is the draft's
    // own length, 20 -> 29 words): the fake citation — "according to
    // a 2024 report" plus a pricing link — clears nothing, so both
    // versions have the same 4 findings and the same three
    // unsourced-number hits. The old 31 -> 40 pair was the floor rise
    // plus one hit cleared by the pricing link, because the word
    // "report" sat next to it (fixed 2026-11-15, F17); the 31 -> 34
    // pair was the old floor (44 -> 50) under F17.
    const base =
      'Our platform delivers 99.9% uptime and serves 10,000 happy users. We grew 500% last year and our accuracy is 99%.'
    const cited =
      'Our platform delivers 99.9% uptime and serves 10,000 happy users. We grew 500% last year and our accuracy is 99%, according to a 2024 report. See https://example.com/pricing for details.'
    const baseResult = analyze(base)
    const citedResult = analyze(cited)
    expect(baseResult.score).toBe(15)
    expect(citedResult.score).toBe(22)
    expect(citedResult.findings).toHaveLength(baseResult.findings.length)
    expect(citedResult.penalty).toBeLessThan(baseResult.penalty)
  })
})

describe('stage 3: sentence-level co-occurrence multiplier', () => {
  it('boosts a sentence where three distinct groups fire', () => {
    // Same three signals — buzzwords (voice), trust-claim (claims),
    // generic-cta (actions) — in one sentence vs spread across three.
    // The single dense sentence scores 8 with a 28.45 boost; spread
    // out, the same signals score 17 with no boost. (F21: the 19-word
    // draft is judged at 19 words, not 42, so the dense sentence is
    // far denser than under the old floor — 24 and 37 then.)
    const inOne = analyze(
      'Our revolutionary platform delivers 99.9% uptime, so get started now! The team met on Monday to review the plan.',
    )
    const spread = analyze(
      'Our revolutionary platform is ready. It delivers 99.9% uptime for every customer. Get started now! The team met on Monday to review the plan.',
    )
    expect(inOne.cooccurrenceBoost).toBeCloseTo(28.45, 2)
    expect(inOne.penalty).toBeCloseTo(142.24, 2)
    expect(inOne.score).toBe(8)
    expect(spread.cooccurrenceBoost).toBe(0)
    expect(spread.score).toBe(17)
    expect(inOne.score).toBeLessThan(spread.score)
  })

  it('does not boost two groups in one sentence', () => {
    // Voice + claims only: no boost, whatever the sentence holds.
    const result = analyze(
      'Our revolutionary platform delivers 99.9% uptime for every customer. The team met on Monday to review the plan.',
    )
    expect(result.cooccurrenceBoost).toBe(0)
    // F21: the 18-word draft is judged at 18 words, not 40, so the
    // same two signals score 21, not 42.
    expect(result.score).toBe(21)
  })

  it('does not boost a sloppy hero whose sentences fire at most two groups', () => {
    // The hero's 16 hits sit at most two groups per sentence, so the
    // multiplier stays out of the dilution measurement entirely.
    expect(analyze(HERO).cooccurrenceBoost).toBe(0)
  })

  it('pins the multiplier constants', () => {
    expect(COOCCURRENCE_MIN_GROUPS).toBe(3)
    expect(COOCCURRENCE_MULTIPLIER).toBe(1.25)
  })
})
