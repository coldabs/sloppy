import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'

// F17 (2026-11-15): a fake citation — "according to a 2024 report"
// plus a pricing link — used to clear a real unsourced-number hit,
// because the word "report" sat next to the link. A citation is a
// link whose own path looks like evidence, or a named publication
// with a year. Wording next to a bare link does not count.
describe('F17: fake-citation bypass', () => {
  const base =
    'Our platform delivers 99.9% uptime and serves 10,000 happy users. We grew 500% last year and our accuracy is 99%.'

  it('does not let a pricing link plus the word "report" clear a hit', () => {
    const cited =
      'Our platform delivers 99.9% uptime and serves 10,000 happy users. We grew 500% last year and our accuracy is 99%, according to a 2024 report. See https://example.com/pricing for details.'
    const baseResult = analyze(base)
    const citedResult = analyze(cited)
    expect(baseResult.score).toBe(31)
    expect(citedResult.score).toBe(34)
    expect(citedResult.findings).toHaveLength(baseResult.findings.length)
    expect(
      citedResult.findings.filter((f) => f.ruleId === 'unsourced-number'),
    ).toHaveLength(3)
  })

  it('does not let a homepage link clear a hit either', () => {
    const cited = `${base} See https://example.com for the full report.`
    const result = analyze(cited)
    expect(
      result.findings.filter((f) => f.ruleId === 'unsourced-number'),
    ).toHaveLength(3)
  })

  it('still clears a number for a link whose path looks like evidence', () => {
    const real =
      'Our platform delivers 99.9% uptime and serves 10,000 happy users. We grew 500% last year and our accuracy is 99%. Full details in the 2024 survey at https://example.com/reports/survey-2024.'
    const result = analyze(real)
    expect(result.score).toBe(48)
    expect(
      result.findings.filter((f) => f.ruleId === 'unsourced-number'),
    ).toHaveLength(1)
  })

  it('still clears a number for a named publication with a year', () => {
    const named =
      'Our platform delivers 99.9% uptime and serves 10,000 happy users. We grew 500% last year and our accuracy is 99%, according to the 2024 Gartner survey.'
    const result = analyze(named)
    expect(result.score).toBe(40)
    expect(
      result.findings.filter((f) => f.ruleId === 'unsourced-number'),
    ).toHaveLength(2)
  })

  it('does not count a bare "2024 report" with no outlet named', () => {
    const bare =
      'Our platform delivers 99.9% uptime and serves 10,000 happy users. We grew 500% last year and our accuracy is 99%, according to a 2024 report.'
    const result = analyze(bare)
    expect(
      result.findings.filter((f) => f.ruleId === 'unsourced-number'),
    ).toHaveLength(3)
  })
})
