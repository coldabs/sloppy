import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'

// F22 (2026-11-15): curly apostrophes (U+2019/U+2018) evaded every
// phrase rule containing an ASCII apostrophe, and curly quotes are
// what word processors and phones produce by default.
describe('F22: curly apostrophes', () => {
  it('scores curly and straight apostrophes identically', () => {
    const straight = "in today's fast-paced world"
    const curly = 'in today\u2019s fast-paced world'
    const leftCurly = 'in today\u2018s fast-paced world'
    const a = analyze(straight)
    const b = analyze(curly)
    const c = analyze(leftCurly)
    // The audit recorded 62 for the straight version on an older
    // engine; the current engine scores it 48. What matters is that
    // curly and straight now agree exactly.
    expect(a.score).toBe(48)
    expect(b.score).toBe(a.score)
    expect(c.score).toBe(a.score)
    expect(b.penalty).toBe(a.penalty)
    expect(b.findings.map((f) => f.ruleId)).toEqual(
      a.findings.map((f) => f.ruleId),
    )
  })

  it("fires on a curly apostrophe in a contraction rule", () => {
    const text = 'It\u2019s not just a tool, it\u2019s a whole new way of working.'
    const result = analyze(text)
    expect(result.findings.map((f) => f.ruleId)).toContain('not-just')
  })

  it("does not change a clean draft that merely uses curly quotes", () => {
    const text = 'Ana said \u2018the build is ready\u2019 and closed the ticket.'
    expect(analyze(text).score).toBe(100)
  })
})
