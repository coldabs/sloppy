import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'

// F26 (2026-11-15): `notJust` fired on ordinary English — "Not only
// did the build fail, it is blocking the release." — and
// `vagueSolution` fired on technical collocations — "a storage
// solution for the backups", "the aqueous solutions were heated".
// The same-sentence "it's / it is" twist must now reframe (an
// article or "more" follows it), the other half of the F20 design;
// the cross-sentence twist already restricted the same way.
describe('F26: notJust and vagueSolution false positives', () => {
  const filler =
    ' The team met on Monday to review the plan. The report was filed by noon.'

  it('does not fire not-just on a literal "it is" clause', () => {
    const result = analyze(
      'Not only did the build fail, it is blocking the release.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).not.toContain('not-just')
    expect(result.score).toBe(100)
  })

  it('still fires not-just when "it is" reframes', () => {
    const result = analyze(
      'This is not just a tool, it is a whole new way of working.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).toContain('not-just')
  })

  it('still fires not-just on the "but" reframing', () => {
    const result = analyze(
      'This is not just a tool, but a partner.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).toContain('not-just')
  })

  it('does not fire vague-solution on a storage solution', () => {
    const result = analyze(
      'We need a storage solution for the backups.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).not.toContain(
      'vague-solution',
    )
    expect(result.score).toBe(100)
  })

  it('does not fire vague-solution on aqueous solutions', () => {
    const result = analyze(
      'The aqueous solutions were heated to 80 degrees.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).not.toContain(
      'vague-solution',
    )
    expect(result.score).toBe(100)
  })

  it('does not fire vague-solution on saline buffer solutions', () => {
    const result = analyze(
      'The saline buffer solutions were prepared fresh.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).not.toContain(
      'vague-solution',
    )
  })

  it('still fires vague-solution on a product pitch', () => {
    const result = analyze(
      'Our solutions deliver everything you need.' + filler,
    )
    expect(result.findings.map((f) => f.ruleId)).toContain('vague-solution')
  })
})
