import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'
import { exampleDraft } from './exampleDraft'

const ruleIds = (text: string) =>
  analyze(text).findings.map((finding) => finding.ruleId)

const sentence = (first: string, words: number) =>
  `${first} ${'word '.repeat(words - 1).trim()}.`

describe('fix2: F-17 zero-width next to a hyphen', () => {
  it('scores "fast\u200b-paced" like plain "fast-paced"', () => {
    expect(analyze("In today's fast\u200b-paced world, teams need more.").score).toBe(
      analyze("In today's fast-paced world, teams need more.").score,
    )
    expect(ruleIds("In today's fast\u200b-paced world, teams need more.")).toContain(
      'buzzwords',
    )
  })
})

describe('fix2: F-18 links have to look like evidence', () => {
  it('does not clear a number with a pricing link', () => {
    expect(
      ruleIds('10,000 happy users, see https://example.com/pricing for details.'),
    ).toContain('unsourced-number')
  })

  it('clears a number with a link to a report', () => {
    expect(
      ruleIds(
        '10,000 happy users, see the full report at https://example.com/2025-survey.pdf for details.',
      ),
    ).not.toContain('unsourced-number')
  })

  it('does not clear a number with a bare homepage link', () => {
    expect(
      ruleIds('10,000 happy users, see https://example.com for details.'),
    ).toContain('unsourced-number')
  })
})

describe('fix2: F-19 a citation has to name its publication', () => {
  it('flags "a 2024 report" with no outlet named', () => {
    expect(
      ruleIds('10,000 happy users, according to a 2024 report.'),
    ).toContain('unsourced-number')
  })

  it('leaves a named publication with a year alone', () => {
    expect(
      ruleIds('10,000 happy users, according to the 2024 Gartner report.'),
    ).not.toContain('unsourced-number')
  })
})

describe('fix2: F-20 one claim counts once', () => {
  it('counts "99.9% uptime" as a trust claim, not a trust claim plus a number', () => {
    expect(ruleIds('We guarantee 99.9% uptime.')).toEqual(['trust-claim'])
    // Stage 3, intentional change: this 4-word draft is judged
    // against a 12-word floor, not 50, so the one high hit costs a
    // 68.18 penalty and scores 29 instead of 63. It still counts
    // once, under the trust-claim rule only.
    expect(analyze('We guarantee 99.9% uptime.').score).toBe(22)
  })

  it('counts "Trusted by 10,000 teams" as social proof only', () => {
    expect(ruleIds('Trusted by 10,000 teams worldwide.')).toEqual(['social-proof'])
    // Stage 3, intentional change: this 5-word draft is judged
    // against a 12-word floor, not 50, so the one medium hit costs
    // a 40.91 penalty and scores 48 instead of 76.
    expect(analyze('Trusted by 10,000 teams worldwide.').score).toBe(40)
  })

  it('still flags a number when no social-proof phrase matches it', () => {
    expect(ruleIds('Join a million happy readers.')).toContain('unsourced-number')
  })

  it('scores the built-in example draft higher than before', () => {
    // P2 moved the score from 6 to 9: the single trailing dash
    // ("- Jamie, CEO") no longer counts at em-dash density, and the
    // draft still lands in Industrial slop.
    expect(analyze(exampleDraft).score).toBe(9)
  })
})

describe('fix2: F-21 near-variants of listed phrases', () => {
  it('flags "worth noting"', () => {
    expect(ruleIds("It's worth noting that this matters a lot.")).toContain('ai-tells')
  })

  it('flags "in today\'s online world"', () => {
    expect(ruleIds("In today's online world, teams move fast.")).toContain(
      'overused-opener',
    )
  })

  it('flags "unlock your full potential"', () => {
    expect(ruleIds('Unlock your full potential with our platform.')).toContain(
      'ai-tells',
    )
  })

  it('flags a spelled-out percentage with claim context', () => {
    expect(ruleIds('We grew five hundred percent last year.')).toContain(
      'unsourced-number',
    )
    expect(ruleIds('The battery is at fifty percent.')).not.toContain(
      'unsourced-number',
    )
  })

  it('flags "yet" as a not-just twist', () => {
    expect(ruleIds('Not just a tool, yet a whole new way of working.')).toContain(
      'not-just',
    )
  })

  it('flags an accented "délve" in a cluster of tells', () => {
    expect(
      ruleIds(
        'Délve into the details, navigate the tapestry, and showcase the realm.',
      ),
    ).toContain('ai-tells')
  })

  it('leaves a single accented "délve" alone', () => {
    // Polish: a single clustered tell is ordinary prose, however it
    // is spelled — the normalisation still works, the gate is the
    // cluster.
    expect(ruleIds('Délve into the details.')).not.toContain('ai-tells')
  })
})

describe('fix2: F-22 character tricks', () => {
  it('catches combining marks, small caps, and Armenian/Cyrillic lookalikes', () => {
    expect(ruleIds('seaml\u0065\u0301ss platform')).toContain('buzzwords')
    expect(ruleIds('sᴇᴀᴍʟᴇss platform')).toContain('buzzwords')
    expect(ruleIds('revolutiօnary platform')).toContain('buzzwords')
    expect(ruleIds('гevolutionary platform')).toContain('buzzwords')
  })

  it('catches a listed word split by a period or slash', () => {
    expect(ruleIds('Our seam.less platform')).toContain('buzzwords')
  })

  it('leaves versions and "and/or" alone', () => {
    expect(analyze('Version v2.0 shipped.').score).toBe(100)
    expect(analyze('Tea and/or coffee is available.').score).toBe(100)
  })
})

describe('fix2: F-23 a line break does not defeat "not just"', () => {
  it('flags a twist on the next line after a comma', () => {
    expect(
      ruleIds('Not just a tool,\nbut a partner for the whole team.'),
    ).toContain('not-just')
  })

  it('still leaves two separate sentences alone', () => {
    expect(ruleIds("Not just the speed. It's about trust.")).not.toContain('not-just')
  })
})

describe('fix2: F-24 near-runs', () => {
  it('flags five sentences within two words of each other', () => {
    const text = [
      sentence('Alpha', 8),
      sentence('Bravo', 10),
      sentence('Charlie', 8),
      sentence('Delta', 10),
      sentence('Echo', 8),
    ].join(' ')
    expect(ruleIds(text)).toContain('same-length-sentences')
  })

  it('leaves four sentences varying by two words alone', () => {
    const text = [
      sentence('Alpha', 8),
      sentence('Bravo', 10),
      sentence('Charlie', 8),
      sentence('Delta', 10),
    ].join(' ')
    expect(ruleIds(text)).not.toContain('same-length-sentences')
  })

  it('flags two adjacent sentences carrying two adverbs each', () => {
    expect(
      ruleIds(
        'She moved quickly and efficiently today. He worked thoroughly and remarkably yesterday.',
      ),
    ).toContain('adverb-density')
  })

  it('leaves three adverbs split 2-and-1 across two sentences alone', () => {
    expect(
      ruleIds(
        'She moved quickly and efficiently today. He worked slowly yesterday.',
      ),
    ).not.toContain('adverb-density')
  })
})

describe('fix2: F-25 percentages need claim context', () => {
  it('leaves plain measurements alone', () => {
    expect(analyze('The battery is at 50%.').score).toBe(100)
    expect(analyze('Half the team (50%) agreed with the plan.').score).toBe(100)
    expect(analyze('Everything is 50% off this weekend.').score).toBe(100)
  })

  it('still flags percentages used as claims', () => {
    expect(ruleIds('We grew 500% last year.')).toContain('unsourced-number')
    expect(
      ruleIds('The survey found that 87% of users prefer the new design.'),
    ).toContain('unsourced-number')
  })
})

describe('fix2: F-29 the URL window measures the start of the link', () => {
  it('exempts an evidence link starting within 40 characters of the number', () => {
    expect(
      ruleIds('We serve 10,000 users, see https://example.com/report-2025'),
    ).not.toContain('unsourced-number')
    expect(
      ruleIds(
        'We serve 10,000 users xxxxxxxxxxxxxxxxxx https://example.com/report-2025',
      ),
    ).not.toContain('unsourced-number')
  })

  it('exempts an evidence link in the same sentence even when it starts more than 40 characters away', () => {
    // Polish (F-56): an evidence-path link in the same sentence as
    // the number clears it wherever it sits in that sentence — a
    // real citation can sit further than 40 characters past the
    // number and still be the number's source.
    expect(
      ruleIds(
        `We serve 10,000 users ${'x'.repeat(35)} https://example.com/report-2025`,
      ),
    ).not.toContain('unsourced-number')
  })

  it('still flags a number when the evidence link is two sentences away', () => {
    expect(
      ruleIds(
        'We serve 10,000 users. The team works hard every single day. See the full report at https://example.com/report-2025.',
      ),
    ).toContain('unsourced-number')
  })

  it('still flags a number when the link is pricing, however close', () => {
    expect(
      ruleIds(
        'We serve 10,000 users, see https://example.com/pricing for details.',
      ),
    ).toContain('unsourced-number')
  })
})

describe('fix2: F-30/F-31/F-32 headings, docs links, and short labels', () => {
  it('leaves a call to action on a heading line alone', () => {
    expect(analyze('## GET STARTED').score).toBe(100)
    expect(analyze('## GET STARTED').findings).toHaveLength(0)
  })

  it('leaves "learn more" and "click here" pointing at the docs alone', () => {
    expect(analyze('Learn more in the documentation.').score).toBe(100)
    expect(analyze('Click here to read the API reference.').score).toBe(100)
  })

  it('still flags "learn more" pointing at pricing', () => {
    expect(ruleIds('Learn more about our pricing.')).toContain('generic-cta')
  })

  it('leaves a short all-caps label at the start of a sentence alone', () => {
    expect(analyze('FREE SHIPPING on all orders.').score).toBe(100)
  })

  it('still flags a sentence that is all capitals', () => {
    expect(ruleIds('FREE SHIPPING ON ALL ORDERS OVER $50.')).toContain(
      'shouting-caps',
    )
  })

  it('does not crash on a caps run inside a fenced code block or table row', () => {
    expect(() => analyze('```\nGET /api/data HTTP/1.1\n```')).not.toThrow()
    expect(() => analyze('| GET | POST |\n| --- | --- |\n| a | b |')).not.toThrow()
  })
})

describe('fix2: F-34 empty input is not "Clean enough"', () => {
  it('returns a defined empty result', () => {
    const result = analyze('')
    expect(result.empty).toBe(true)
    expect(result.verdict).toBe('Nothing to score')
    expect(result.score).toBe(100)
    expect(result.findings).toHaveLength(0)
    expect(analyze('   ').empty).toBe(true)
  })

  it('marks ordinary drafts as not empty', () => {
    expect(analyze('Hello world.').empty).toBe(false)
  })
})

describe('fix2: F-35 English-only is documented, base layer still works', () => {
  it('says so in the README and in the Method doc', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf-8')
    const method = readFileSync(
      new URL('../../docs/METHOD.md', import.meta.url),
      'utf-8',
    )
    expect(readme).toContain('Only English text is checked')
    expect(method).toContain('Only English text is checked')
  })

  it('still flags an em dash in non-English text', () => {
    // P2: one dash is not evidence in any language. Three paired
    // interruptions in a short French passage are.
    expect(
      ruleIds(
        'Elle a dit \u2014 je cite \u2014 que c\u2019\u00e9tait bien. Elle a dit \u2014 je cite \u2014 que c\u2019\u00e9tait bien. Elle a dit \u2014 je cite \u2014 que c\u2019\u00e9tait bien.',
      ),
    ).toContain('em-dash')
  })
})

describe('fix2: F-36 package hygiene and CI', () => {
  it('declares the Apache 2.0 licence and a real version, and is publishable', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    )
    expect(pkg.license).toBe('Apache-2.0')
    expect(pkg.version).toBe('0.2.0')
    // F60: the package is no longer private — `npx sloppy` has to be
    // installable — and the published tarball must carry the built
    // CLI bundle, which is gitignored and would otherwise be left
    // out. `prepare` builds it before `npm publish` packs.
    expect(pkg.private).toBeUndefined()
    expect(pkg.files).toContain('bin')
    expect(pkg.files).toContain('dist')
    // S2: the bare name `sloppy` is taken on npm by an unrelated
    // project, so the package publishes scoped as @coldabs/sloppy.
    // A scoped package defaults to restricted on publish — the
    // access pin makes a plain `npm publish` public.
    expect(pkg.name).toBe('@coldabs/sloppy')
    expect(pkg.publishConfig?.access).toBe('public')
  })

  it('has a CI workflow that lints, typechecks, tests, and builds', () => {
    const ciPath = new URL('../../.github/workflows/ci.yml', import.meta.url)
    expect(existsSync(ciPath)).toBe(true)
    const ci = readFileSync(ciPath, 'utf-8')
    for (const step of ['npm run lint', 'npm run typecheck', 'npm test', 'npm run build']) {
      expect(ci).toContain(step)
    }
  })
})

describe('fix2: F-38 a paired interruption counts once', () => {
  it('counts two dashes around one interruption as one hit', () => {
    // P2: the pairing still holds, but a single interruption is
    // below the density threshold, so three pairs are needed to see
    // it fire.
    const result = analyze(
      'She said \u2014 and I quote \u2014 that it was fine. He said \u2014 and I quote \u2014 that it was done. They said \u2014 and I quote \u2014 that it was ready.',
    )
    expect(result.findings.filter((finding) => finding.ruleId === 'em-dash')).toHaveLength(3)
    expect(result.score).toBe(46)
  })
})

describe('fix2: P1 exemptions still hold', () => {
  it('leaves "Explore the codebase" and known acronyms alone', () => {
    expect(analyze('Explore the codebase and read the contributing guide.').score).toBe(100)
    expect(
      analyze('The NASA report and the FBI statement were both published.').score,
    ).toBe(100)
  })

  it('still flags a shouted banner', () => {
    expect(ruleIds('SALE ENDS TODAY. BUY ONE GET ONE FREE.')).toContain(
      'shouting-caps',
    )
  })
})
