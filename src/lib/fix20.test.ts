import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'

// F20 (2026-11-15): the "not just" cadence across sentence boundaries,
// and the missed testimonial cliche. The cross-sentence twist only
// counts when it reframes ("It is a whole new way of working"), not
// when it merely reports ("It is blocking the release", "It is about
// trust") — designed together with F26.
describe('F20: not-just across sentences', () => {
  const ruleIds = (text: string) =>
    analyze(text).findings.map((f) => f.ruleId)

  it('flags the cross-sentence cadence', () => {
    const text = 'This is not just a tool. It is a whole new way of working.'
    expect(analyze(text).score).toBe(84)
    expect(ruleIds(text)).toContain('not-just')
  })

  it('flags "not merely" as a setup', () => {
    expect(ruleIds('Not merely a tool, but a partner.')).toContain('not-just')
  })

  it('flags a cross-sentence twist with "more"', () => {
    expect(
      ruleIds('This is not just a tool. It is more than a tool.'),
    ).toContain('not-just')
  })

  it('does not flag a cross-sentence twist that merely reports', () => {
    expect(
      analyze('This is not just a delay. It is blocking the release.').score,
    ).toBe(100)
    expect(
      ruleIds('This is not just a delay. It is blocking the release.'),
    ).not.toContain('not-just')
  })

  it('still leaves "Not just the speed. It is about trust." alone', () => {
    expect(analyze("Not just the speed. It's about trust.").score).toBe(100)
    expect(ruleIds("Not just the speed. It's about trust.")).not.toContain(
      'not-just',
    )
  })

  it('flags the missed testimonial cliche', () => {
    const text =
      'I love this product so much. It is the best thing I have ever used.'
    const result = analyze(text)
    expect(result.score).toBe(54)
    expect(
      ruleIds(text).filter((id) => id === 'testimonial-cliche'),
    ).toHaveLength(2)
  })

  it('leaves a plain "I love this product" without the cliche alone', () => {
    // The cliche is the gushing intensifier, not the sentiment.
    expect(analyze('I love this product. It works well.').score).toBe(100)
  })
})
