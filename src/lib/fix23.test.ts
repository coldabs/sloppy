import { describe, expect, it } from 'vitest'
import { analyze, blankCodeSpans } from './analyzer'

// F23 (2026-11-15): fenced code blocks and inline code spans were
// scanned as prose, so a listed word in code fired the rules.
describe('F23: code blocks are not prose', () => {
  it('skips a fenced code block', () => {
    const text =
      'The deployment guide is below.\n```\nseamless\n```\nThe team follows it every week.'
    const result = analyze(text)
    expect(result.words).toBe(11)
    expect(result.score).toBe(100)
    expect(result.findings).toEqual([])
  })

  it('skips a fenced block with a language tag and a tilde fence', () => {
    const js =
      'The deployment guide is below.\n```js\nseamless\n```\nThe team follows it every week.'
    expect(analyze(js).score).toBe(100)
    const tilde =
      'The deployment guide is below.\n~~~\nseamless\n~~~\nThe team follows it every week.'
    expect(analyze(tilde).score).toBe(100)
  })

  it('skips an inline code span', () => {
    const text =
      'Use the `seamless` flag to enable it. The team follows the guide every week.'
    const result = analyze(text)
    expect(result.words).toBe(13)
    expect(result.score).toBe(100)
  })

  it('still flags the same word in prose', () => {
    const text =
      'The deployment guide is below. seamless The team follows it every week.'
    expect(analyze(text).score).toBe(48)
    expect(analyze(text).findings.map((f) => f.ruleId)).toContain('buzzwords')
  })

  it('still flags prose after a code block', () => {
    const text =
      '```\nconst x = 1;\n```\nOur seamless platform is revolutionary and world-class.'
    const result = analyze(text)
    expect(result.findings.map((f) => f.ruleId)).toContain('buzzwords')
    expect(result.score).toBeLessThan(100)
  })

  it('treats a code-only draft as nothing to score', () => {
    const result = analyze('```\nseamless\n```')
    expect(result.score).toBe(100)
    expect(result.verdict).toBe('Nothing to score')
    expect(result.words).toBe(0)
    expect(result.empty).toBe(false)
    expect(result.findings).toEqual([])
  })

  it('treats an unclosed fence as code to the end', () => {
    const result = analyze(
      'The deployment guide is below.\n```\nseamless\nThe team follows it every week.',
    )
    expect(result.score).toBe(100)
  })

  it('leaves an unmatched backtick as prose', () => {
    // A stray backtick is not a code span, so the word still fires.
    const result = analyze(
      'The `seamless platform is ready for the team to use today.',
    )
    expect(result.findings.map((f) => f.ruleId)).toContain('buzzwords')
  })

  it('blanks code spans without moving offsets', () => {
    const blanked = blankCodeSpans('ab `cd` ef')
    expect(blanked).toBe('ab      ef')
    expect(blanked.length).toBe('ab `cd` ef'.length)
    expect(blankCodeSpans('a\n```\nb\n```\nc')).toBe('a\n   \n \n   \nc')
  })
})
