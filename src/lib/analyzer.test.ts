import { describe, expect, it } from 'vitest'
import { analyze, buildMarkedSegments, verdictFor } from './analyzer'
import { rules } from './rules'

const ruleIds = (text: string) => analyze(text).findings.map((finding) => finding.ruleId)

describe('analyze', () => {
  it('returns a clean result for plain, specific copy', () => {
    const result = analyze(
      'The tool reads your draft in the browser. It lists every phrase that matched one of its rules. Nothing is uploaded.',
    )
    expect(result.findings).toHaveLength(0)
    expect(result.score).toBe(100)
    expect(result.verdict).toBe('Clean enough')
  })

  it('detects an em dash', () => {
    expect(ruleIds('Fast, secure \u2014 and local.')).toContain('em-dash')
  })

  it('detects hype vocabulary case-insensitively', () => {
    const ids = ruleIds('A Revolutionary and SEAMLESS workflow.')
    expect(ids).toContain('buzzwords')
  })

  it('detects a generic call to action', () => {
    expect(ruleIds('Get Started with the tool today.')).toContain('generic-cta')
  })

  it('flags a percentage with no source nearby', () => {
    expect(ruleIds('We serve 99.9% uptime every month.')).toContain('unsourced-number')
  })

  it('ignores a number that names its source', () => {
    const ids = ruleIds('Uptime was 99.9%, according to the 2025 audit report.')
    expect(ids).not.toContain('unsourced-number')
  })

  it('flags compliance claims at high severity', () => {
    const result = analyze('Our SOC 2 compliant platform keeps data safe.')
    const finding = result.findings.find((item) => item.ruleId === 'trust-claim')
    expect(finding?.severity).toBe('high')
  })

  it('scores slop lower than clean copy', () => {
    const slop = analyze(
      'Our revolutionary AI-powered platform is the next generation of team collaboration. Trusted by 10,000+ teams, we deliver 99.9% uptime and enterprise-grade security. Get started today!!',
    )
    const clean = analyze(
      'The tool reads a draft in the browser. It lists matched phrases and suggests a fix. Nothing is uploaded.',
    )
    expect(slop.score).toBeLessThan(clean.score)
    expect(slop.rulesHit).toBeGreaterThan(1)
  })

  it('counts a rule at most twice toward the score', () => {
    const few = analyze('seamless seamless')
    const many = analyze('seamless seamless seamless seamless seamless')
    expect(many.penalty).toBe(few.penalty)
  })

  it('a draft full of different patterns lands in a low band', () => {
    const result = analyze(
      'Our revolutionary AI-powered platform \u2014 trusted by 10,000+ teams \u2014 delivers 99.9% uptime and SOC 2 compliance. GET STARTED NOW!! In today\'s fast-paced world, our seamless all-in-one solutions leverage synergies and take it to the next level. Not just a tool, but a game changer. "It changed my life." - Jamie, CEO',
    )
    expect(result.score).toBeLessThan(30)
    expect(result.rulesHit).toBeGreaterThanOrEqual(8)
  })

  it('handles empty input without throwing', () => {
    const result = analyze('')
    expect(result.score).toBe(100)
    expect(result.words).toBe(0)
    expect(result.findings).toHaveLength(0)
  })

  it('reports every configured rule once in the rule list', () => {
    expect(rules.length).toBe(new Set(rules.map((rule) => rule.id)).size)
    expect(rules.length).toBeGreaterThan(8)
  })
})

describe('buildMarkedSegments', () => {
  it('returns the whole text as plain when nothing matched', () => {
    expect(buildMarkedSegments('hello', [])).toEqual([{ text: 'hello', severity: null }])
  })

  it('marks a matched range and keeps the surrounding text', () => {
    const text = 'one \u2014 two'
    const findings = analyze(text).findings
    const segments = buildMarkedSegments(text, findings)
    expect(segments.map((segment) => segment.text).join('')).toBe(text)
    expect(segments.some((segment) => segment.severity === 'high')).toBe(true)
  })

  it('merges overlapping ranges and keeps the worst severity', () => {
    const segments = buildMarkedSegments('abcdef', [
      {
        ruleId: 'a',
        label: 'a',
        group: 'voice',
        severity: 'low',
        note: '',
        fix: '',
        start: 1,
        end: 4,
        excerpt: '',
      },
      {
        ruleId: 'b',
        label: 'b',
        group: 'claims',
        severity: 'high',
        note: '',
        fix: '',
        start: 2,
        end: 5,
        excerpt: '',
      },
    ])
    expect(segments.filter((segment) => segment.severity)).toHaveLength(1)
    expect(segments.find((segment) => segment.severity)?.severity).toBe('high')
  })
})

describe('verdictFor', () => {
  it('maps score bands to verdicts', () => {
    expect(verdictFor(100)).toBe('Clean enough')
    expect(verdictFor(82)).toBe('Mostly clean')
    expect(verdictFor(55)).toBe('Slop creeping in')
    expect(verdictFor(30)).toBe('Heavy slop')
    expect(verdictFor(5)).toBe('Industrial slop')
  })
})
