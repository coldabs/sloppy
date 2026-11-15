import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'

// F27 (2026-11-15): single buzzwords fired regardless of context —
// "leverage" as the correct financial term, "seamless" as a literal
// knitted sleeve. Phrase entries now carry an optional per-entry
// `exempt?: (text, index) => boolean` (common.ts `matchPhrases`):
// "leverage" is exempt when followed by "of + number" or preceded
// by uses|has|employs|with; "seamless" is exempt before garment
// nouns (sleeve, knit, tube, yoke). The verb forms of leverage are
// not exempted — "leverage our synergies" is the hype use.
describe('F27: context-aware buzzword exemptions', () => {
  const filler =
    ' The team met on Monday to review the plan. The report was filed by noon.'

  it('does not fire buzzwords on the financial term "leverage"', () => {
    const result = analyze(
      'The fund uses leverage of three to one.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).not.toContain('buzzwords')
    expect(result.score).toBe(100)
  })

  it('does not fire buzzwords on "leverage of 3 to 1"', () => {
    const result = analyze('The fund uses leverage of 3 to 1.' + filler)
    expect(result.findings.map((f) => f.ruleId)).not.toContain('buzzwords')
  })

  it('does not fire buzzwords on "with leverage"', () => {
    const result = analyze('The fund manages risk with leverage.' + filler)
    expect(result.findings.map((f) => f.ruleId)).not.toContain('buzzwords')
  })

  it('still fires buzzwords on the hype verb "leverage"', () => {
    const result = analyze(
      'Our platform lets you leverage synergies.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).toContain('buzzwords')
  })

  it('still fires buzzwords on the verb form "leverages"', () => {
    const result = analyze('The fund leverages its assets.' + filler)
    expect(result.findings.map((f) => f.ruleId)).toContain('buzzwords')
  })

  it('does not fire buzzwords on a seamless sleeve', () => {
    const result = analyze(
      'The pattern produces a seamless sleeve.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).not.toContain('buzzwords')
    expect(result.score).toBe(100)
  })

  it('does not fire buzzwords on a seamless knit', () => {
    const result = analyze('The pattern produces a seamless knit.' + filler)
    expect(result.findings.map((f) => f.ruleId)).not.toContain('buzzwords')
  })

  it('still fires buzzwords on the hype adjective "seamless"', () => {
    const result = analyze(
      'Our platform gives a seamless experience.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).toContain('buzzwords')
  })
})
