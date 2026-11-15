import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'

// F19 (2026-11-15): two new signals for boundary cases that scored a
// silent 100, plus the deliberate boundaries that stay silent.
// - urgency-scarcity: deadline/scarcity sales wording (C25).
// - hype-punctuation: the same emoji three or more times in a row (C27).
// The other 15 silent probes are boundaries by design, not misses:
// C12 (em-dash min-count 3), C14–C16 (same-length/repeated-opening
// thresholds), C17 (two adverbs is ordinary English), C18 (style-word
// clusters need three distinct words), C24 (one repeated bigram in
// clean prose), C26 ("100% FREE" is a price statement, not a claim),
// C37 (bare numbers under 1,000 are not claims), C41 (one "delve"
// never fires — ai-tells needs four distinct tells clustered, plain
// or Cyrillic), C42 (a real evidence link legitimately clears).
// C28 and C34 belong to F20 (not-just across sentences, testimonial
// cliche). STRESS3.md's C25/C27 rows are now stale pending F62.
describe('F19: boundary slop coverage', () => {
  const ruleIds = (text: string) =>
    analyze(text).findings.map((f) => f.ruleId)

  it('flags urgency and scarcity wording (C25)', () => {
    const text =
      'AMAZING deal, only today, while stocks last, so hurry and grab yours now.'
    const result = analyze(text)
    expect(result.score).toBe(69)
    expect(ruleIds(text).filter((id) => id === 'urgency-scarcity')).toHaveLength(3)
  })

  it('flags the same emoji three times in a row (C27)', () => {
    const text =
      'This is amazing \u{1F600}\u{1F600}\u{1F600} and everyone loves it so much today.'
    const result = analyze(text)
    expect(result.score).toBe(81)
    expect(ruleIds(text)).toContain('hype-punctuation')
  })

  it('leaves a single ordinary emoji alone', () => {
    const text = 'Thanks for the help today \u{1F600} — the notes are in the repo.'
    expect(analyze(text).score).toBe(100)
    expect(ruleIds(text)).not.toContain('hype-punctuation')
  })

  it('leaves two repeated emoji alone', () => {
    const text = 'Great news \u{1F600}\u{1F600} — the build passed on the first try today.'
    expect(ruleIds(text)).not.toContain('hype-punctuation')
  })

  it('leaves a draft of nothing but emoji alone', () => {
    // D11: four identical emoji and no words — no prose to hype.
    const text = '\u{1F600}\u{1F600}\u{1F600}\u{1F600}'
    expect(analyze(text).score).toBe(100)
    expect(ruleIds(text)).not.toContain('hype-punctuation')
  })

  it('flags each urgency phrase on its own', () => {
    for (const phrase of [
      'while stocks last',
      'while supplies last',
      'act now',
      "don't miss out",
      'limited time offer',
      'last chance',
      'only today',
      'offer ends',
    ]) {
      expect(ruleIds(`The sale ends soon — ${phrase}, or it is gone.`)).toContain(
        'urgency-scarcity',
      )
    }
  })

  it('does not flag ordinary words that merely contain an urgency word', () => {
    // "today" on its own, "act" as a verb, and "chance" in a neutral
    // sentence are not urgency wording.
    expect(
      analyze('The meeting is today at noon in the main room.').score,
    ).toBe(100)
    expect(
      analyze('We will act on the feedback after the review.').score,
    ).toBe(100)
  })

  it('still leaves the deliberate boundaries silent', () => {
    // C12: two em-dashes (min-count 3). C17: two adverbs. C18: two
    // style words (clusters need three). C26: "100% FREE" is a price
    // statement. C42: a real evidence link legitimately clears.
    expect(
      analyze(
        'The plan is simple — we ship on Friday. The team is ready — and the work is done.',
      ).score,
    ).toBe(100)
    expect(
      analyze('She worked quickly and carefully through the long list of tickets.')
        .score,
    ).toBe(100)
    expect(
      analyze('The notably holistic draft was a careful approach to the work.')
        .score,
    ).toBe(100)
    expect(
      analyze('100% FREE for every new user, no card needed, cancel anytime you like.')
        .score,
    ).toBe(100)
    expect(
      analyze(
        'We grew 500% last year. The full details are in the report at https://example.com/reports/survey-2024 for anyone who wants to check.',
      ).score,
    ).toBe(100)
  })
})
