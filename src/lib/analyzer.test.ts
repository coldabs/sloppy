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

  it('detects em dashes at density', () => {
    // P2: one dash is a stylistic choice, not evidence. The rule
    // fires only at density: more than 20 pause-dashes per 1,000
    // words, and at least 3 of them.
    expect(
      ruleIds('Fast, secure \u2014 and local. Quick, simple \u2014 and cheap. Bold, bright \u2014 and new.'),
    ).toContain('em-dash')
    expect(ruleIds('Fast, secure \u2014 and local.')).not.toContain('em-dash')
  })

  it('does not flag dashes that are document structure', () => {
    // A list bullet, a table separator, a horizontal rule, and the
    // separators in a table of contents are structure, not pauses.
    // Without this, a README full of markdown would score far worse
    // than its prose deserves.
    const ids = ruleIds(
      '- First item\n- Second item\n\n| A | B |\n| --- | --- |\n\n---\n\n- [Why](#why) - [What](#what) - [Run it](#run-it)',
    )
    expect(ids).not.toContain('em-dash')
  })

  it('still flags a spaced hyphen used as a pause in a sentence', () => {
    expect(
      ruleIds('Fast, secure - and local. Quick, simple - and cheap. Bold, bright - and new.'),
    ).toContain('em-dash')
  })

  it('does not flag a minus sign as an em dash', () => {
    expect(
      ruleIds('The score is round(100 * e^(-penalty / 55)).'),
    ).not.toContain('em-dash')
  })

  it('detects hype vocabulary case-insensitively', () => {
    const ids = ruleIds('A Revolutionary and SEAMLESS workflow.')
    expect(ids).toContain('buzzwords')
  })

  it('detects a generic call to action', () => {
    expect(ruleIds('Get Started with the tool today.')).toContain('generic-cta')
  })

  it('flags a percentage with no source nearby', () => {
    // "99.9% uptime" is a trust claim, so it counts once, under that
    // rule, not under this one. A percentage that is not a trust claim
    // still flags here.
    expect(ruleIds('We serve 99.9% more customers every month.')).toContain(
      'unsourced-number',
    )
  })

  it('ignores a number that names its source', () => {
    // A citation has to name its publication: "the 2025 Gartner audit
    // report" counts, a bare "2025 audit report" does not.
    const ids = ruleIds('Uptime was 99.9%, according to the 2025 Gartner audit report.')
    expect(ids).not.toContain('unsourced-number')
  })

  it('flags a number whose "source" names no publication', () => {
    const ids = ruleIds('Uptime was 99.9%, according to the 2025 audit report.')
    expect(ids).toContain('unsourced-number')
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

  it('repeats cost more than saying it twice, on a levelling-off scale', () => {
    // P0-3, intentional change: the old 2-hit cap is gone. Repeating
    // one pattern now costs more the more it appears, with diminishing
    // returns, instead of stopping at two hits.
    const two = analyze('seamless seamless')
    const twenty = analyze('seamless '.repeat(20))
    const twoHundred = analyze('seamless '.repeat(200))
    expect(twenty.penalty).toBeGreaterThan(two.penalty)
    expect(twoHundred.penalty).toBeGreaterThan(twenty.penalty)
    expect(twoHundred.score).toBeLessThan(twenty.score)
    expect(twenty.score).toBeLessThan(two.score)
  })

  it('scores one hit in a short draft much lower than in a long draft', () => {
    // Three pause-dashes in nine words is dense; the same three
    // dashes diluted across 5,009 words are not. The long text uses
    // distinct filler words so the diversity rules do not fire on
    // the repetition itself.
    const short = analyze('Hi \u2014 there. Hi \u2014 there. Hi \u2014 there.')
    const filler = Array.from({ length: 5006 }, (_, i) => `word${i}`).join(' ')
    const long = analyze(`Hi \u2014 there ${filler}`)
    expect(long.words).toBe(5009)
    expect(short.score).toBeLessThan(long.score)
    expect(long.score).toBeGreaterThan(90)
    expect(short.score).toBeLessThan(70)
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

  it('flags realistic AI copy that used to score 100', () => {
    const paragraph = analyze(
      'Delve into the tapestry of this crucial landscape. Furthermore, moreover, in conclusion, it is pivotal to foster a robust framework that navigates the realm of modern work.',
    )
    expect(ruleIds(
      'Delve into the tapestry of this crucial landscape. Furthermore, moreover, in conclusion, it is pivotal to foster a robust framework that navigates the realm of modern work.',
    )).toContain('ai-tells')
    expect(paragraph.score).toBeLessThan(80)
  })

  it('flags a realistic AI landing page', () => {
    const result = analyze(
      'Welcome to the future of work. Our platform helps you unlock your potential and achieve more, together. We believe great teams do great things when they have the right tools. Join us on this journey and see what is possible when everything just works.',
    )
    expect(result.score).toBeLessThan(100)
    expect(ruleIds(
      'Welcome to the future of work. Our platform helps you unlock your potential and achieve more, together.',
    )).toContain('ai-tells')
  })

  it('flags the missing calls to action', () => {
    const ids = ruleIds(
      'Buy now! Subscribe today! Download it free! Book a demo! Get a quote! Sign up!',
    )
    expect(ids).toContain('generic-cta')
  })

  it('flags vague superlatives', () => {
    const ids = ruleIds(
      'The best tool for the job. The ultimate choice for professionals. The perfect fit for your needs.',
    )
    expect(ids).toContain('vague-superlative')
  })

  it('flags "as an AI language model"', () => {
    expect(
      ruleIds('As an AI language model, I would be happy to help you with that task.'),
    ).toContain('ai-tells')
  })

  it('flags a bare sign-up and a free-trial call to action', () => {
    const ids = ruleIds('Sign up to continue. Start your free trial today.')
    expect(ids).toContain('generic-cta')
  })

  it('flags a number when the only "source" is the word data', () => {
    const ids = ruleIds('We serve 99.9% uptime and 10,000+ users. The data is clear.')
    expect(ids).toContain('unsourced-number')
  })

  it('flags a number with "per the survey data" and no year', () => {
    expect(ruleIds('We grew 500% per the survey data.')).toContain('unsourced-number')
  })

  it('does not flag a number with a link to evidence next to it', () => {
    // The link has to look like evidence: a report path counts, a bare
    // homepage does not.
    const ids = ruleIds(
      'We grew 500% last year. See https://example.com/2025-growth-report for the full breakdown.',
    )
    expect(ids).not.toContain('unsourced-number')
  })

  it('flags a number whose only link is a bare homepage', () => {
    const ids = ruleIds(
      'We grew 500% last year. See https://example.com for the full breakdown.',
    )
    expect(ids).toContain('unsourced-number')
  })

  it('keeps clean technical copy clean', () => {
    const result = analyze(
      'The API returns JSON over HTTPS. Set the API_KEY in the SDK config before you run the build.',
    )
    expect(result.score).toBe(100)
    expect(result.findings).toHaveLength(0)
  })

  it('leaves "Explore the codebase" alone (a P1 fix, not a P0 one)', () => {
    // P1-5, intentional change: "Explore" followed by documentation
    // words is navigation, not a sales button. The old P0 test
    // asserted the opposite and was replaced by this one.
    const result = analyze('Explore the codebase and read the contributing guide.')
    expect(ruleIds('Explore the codebase and read the contributing guide.')).not.toContain(
      'generic-cta',
    )
    expect(result.score).toBe(100)
  })
})

describe('buildMarkedSegments', () => {
  it('returns the whole text as plain when nothing matched', () => {
    expect(buildMarkedSegments('hello', [])).toEqual([{ text: 'hello', severity: null }])
  })

  it('marks a matched range and keeps the surrounding text', () => {
    const text = 'Our SOC 2 platform is ready.'
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
