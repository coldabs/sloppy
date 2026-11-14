import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'
import { rules } from './rules'

const ruleIds = (text: string) =>
  analyze(text).findings.map((finding) => finding.ruleId)

describe('P1: de-duplication (F-06)', () => {
  it('counts one span once, at the worst severity', () => {
    const result = analyze("In today's fast-paced world, teams need more.")
    expect(ruleIds("In today's fast-paced world, teams need more.")).toContain('buzzwords')
    expect(ruleIds("In today's fast-paced world, teams need more.")).not.toContain(
      'overused-opener',
    )
    expect(result.findings).toHaveLength(1)
    // P0 scored 67 here (penalty 21.67, counted twice). One span is
    // one piece of evidence, so the penalty drops to 15 and the
    // score rises to 76.
    expect(result.score).toBe(76)
  })
})

describe('P1: sentence-level "not just" (F-07)', () => {
  it('flags a long clause that used to escape at 48 characters', () => {
    const ids = ruleIds(
      'Not just a tool for teams that want to move faster and work smarter every day, but a whole new way of working.',
    )
    expect(ids).toContain('not-just')
  })

  it('flags a 49-word clause, not just a 48-character one', () => {
    expect(ruleIds(`Not just ${'a'.repeat(49)}, but a partner.`)).toContain('not-just')
    expect(ruleIds(`Not just ${'a'.repeat(48)}, but a partner.`)).toContain('not-just')
  })

  it('does not match across two sentences', () => {
    expect(ruleIds("Not just the speed. It's about trust.")).not.toContain('not-just')
  })

  it('still flags "not only"', () => {
    expect(ruleIds('Not only a tool, but a whole new way of working.')).toContain(
      'not-just',
    )
  })
})

describe('P1: bare and spelled-out claim numbers (F-08)', () => {
  it('flags a large round number used as a selling claim', () => {
    expect(ruleIds('We have 10000 users, 500 customers and 42 offices across 12 countries.')).toContain(
      'unsourced-number',
    )
    expect(ruleIds('We have 10,000 happy users.')).toContain('unsourced-number')
  })

  it('flags spelled-out magnitudes in a claim', () => {
    expect(ruleIds('We serve ten thousand teams and five hundred customers.')).toContain(
      'unsourced-number',
    )
    expect(ruleIds('Trusted by 10 thousand teams and 10 million readers.')).toContain(
      'unsourced-number',
    )
    expect(ruleIds('Join a million happy readers.')).toContain('unsourced-number')
  })

  it('does not flag a year, and flags the claim number next to it', () => {
    expect(ruleIds('We launched in 2024.')).not.toContain('unsourced-number')
    expect(ruleIds('We launched in 2024 and now serve 12,000 users.')).toContain(
      'unsourced-number',
    )
  })

  it('leaves a cited claim number alone', () => {
    expect(
      ruleIds('We have 10,000 users, according to the 2025 survey report.'),
    ).not.toContain('unsourced-number')
  })

  it('leaves numbers with context alone', () => {
    const clean = [
      'The server handled 10,000 requests in the last hour.',
      'Version 2.0 shipped in 2024. The file is 2,400 bytes.',
      '42 offices across 12 countries.',
    ]
    for (const text of clean) {
      const result = analyze(text)
      expect(ruleIds(text)).not.toContain('unsourced-number')
      expect(result.score).toBe(100)
    }
  })
})

describe('P1: findings pagination (F-09)', () => {
  it('returns every hit instead of stopping at 40 per rule', () => {
    const result = analyze('seamless '.repeat(100))
    expect(result.hits).toBe(100)
    expect(result.findings).toHaveLength(100)
    const group = result.groups.find((item) => item.rule.id === 'buzzwords')
    expect(group?.hits).toHaveLength(100)
  })

  it('returns all 450 hits of a long repetitive draft', () => {
    const result = analyze('seamless '.repeat(450))
    expect(result.hits).toBe(450)
    expect(result.findings).toHaveLength(450)
  })
})

describe('P1: context exemptions and allowlist (F-10)', () => {
  it('leaves "Explore the codebase" alone', () => {
    const result = analyze('Explore the codebase and read the contributing guide.')
    expect(ruleIds('Explore the codebase and read the contributing guide.')).not.toContain(
      'generic-cta',
    )
    expect(result.score).toBe(100)
  })

  it('still flags a sales "explore"', () => {
    expect(ruleIds('Explore our platform and discover amazing features.')).toContain(
      'generic-cta',
    )
  })

  it('leaves maths "solutions" alone, across two sentences', () => {
    const result = analyze('Find all solutions to the equation. There are two solutions.')
    expect(ruleIds('Find all solutions to the equation. There are two solutions.')).not.toContain(
      'vague-solution',
    )
    expect(result.score).toBe(100)
  })

  it('still flags a product "solutions"', () => {
    expect(ruleIds('Our solutions help teams do more.')).toContain('vague-solution')
  })

  it('leaves a trust claim alone when it links its audit', () => {
    const text =
      'SOC 2 Type II certified. Read the full audit report at https://example.com/audit-2025.pdf'
    expect(ruleIds(text)).not.toContain('trust-claim')
    expect(analyze(text).score).toBe(100)
  })

  it('still flags a trust claim whose link is not an audit', () => {
    expect(
      ruleIds('SOC 2 compliant. See pricing at https://example.com/pricing.'),
    ).toContain('trust-claim')
  })

  it('leaves known acronyms alone', () => {
    const result = analyze('The NASA report and the FBI statement were both published.')
    expect(result.score).toBe(100)
    expect(result.findings).toHaveLength(0)
  })

  it('leaves capitalised headings alone', () => {
    const result = analyze('INTRODUCTION\n\nSome text here.\n\nCONCLUSION')
    expect(result.score).toBe(100)
    expect(result.findings).toHaveLength(0)
  })

  it('leaves one capitalised word alone in a sentence', () => {
    const result = analyze('FREE shipping on all orders over $50.')
    expect(result.score).toBe(100)
    expect(result.findings).toHaveLength(0)
  })

  it('still flags a shouted banner', () => {
    const result = analyze('SALE ENDS TODAY. BUY ONE GET ONE FREE.')
    expect(ruleIds('SALE ENDS TODAY. BUY ONE GET ONE FREE.')).toContain('shouting-caps')
    expect(result.score).toBe(64)
  })

  it('leaves "get started" alone when it is followed by a command', () => {
    const result = analyze('To get started, run npm install.')
    expect(ruleIds('To get started, run npm install.')).not.toContain('generic-cta')
    expect(result.score).toBe(100)
  })

  it('still flags a sales "get started"', () => {
    expect(ruleIds('Get started today.')).toContain('generic-cta')
  })
})

describe('P1: structural signals (F-13)', () => {
  it('flags a run of same-length sentences and repeated openings', () => {
    const text =
      'In the morning, we plan. In the afternoon, we build. In the evening, we ship. At night, we rest. Before dawn, we review.'
    const ids = ruleIds(text)
    expect(ids).toContain('same-length-sentences')
    expect(ids).toContain('repeated-openings')
  })

  it('flags repeated openings on their own', () => {
    const text =
      'In the morning, we plan the day. In the afternoon, we build the feature. In the evening, we ship the release.'
    const ids = ruleIds(text)
    expect(ids).toContain('repeated-openings')
    expect(ids).not.toContain('same-length-sentences')
  })

  it('flags an adverb-stuffed sentence', () => {
    const text =
      'She moved very quickly and extremely efficiently, working really thoroughly and quite remarkably on the report.'
    expect(ruleIds(text)).toContain('adverb-density')
  })

  it('leaves varied writing and ordinary adverbs alone', () => {
    const varied =
      'The tool reads your draft. It lists every phrase that matched one of its rules, and it suggests a fix for each one. Nothing is uploaded, and nothing is stored anywhere.'
    expect(analyze(varied).score).toBe(100)
    expect(analyze('He walked slowly home.').score).toBe(100)
    expect(analyze('The report was only published early.').score).toBe(100)
  })
})

describe('P1: rule list', () => {
  it('has eighteen rules, including the three structural ones', () => {
    expect(rules.length).toBe(18)
    const ids = rules.map((rule) => rule.id)
    expect(ids).toContain('same-length-sentences')
    expect(ids).toContain('repeated-openings')
    expect(ids).toContain('adverb-density')
    expect(new Set(ids).size).toBe(ids.length)
  })
})
