// Polish regression tests — one test per stress-test-3 finding fixed
// in the polish round (F-39–F-56). Each test pins the behaviour that
// changed, with the before score from STRESS3.md in the comment, so a
// future change that reopens a finding fails here first.
import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'
import {
  AI_ADJECTIVE_PHRASES,
  AI_TELL_PHRASES,
  BUZZWORD_PHRASES,
  FAKE_AUTHORITY_PHRASES,
  OPENER_PHRASES,
  PSEUDO_WISDOM_PHRASES,
  SOCIAL_PROOF_PHRASES,
  STYLE_WORDS_TIER3,
  SUPERLATIVE_PHRASES,
  TEMPLATE_CLOSER_PHRASES,
  TESTIMONIAL_PHRASES,
} from './rules'

const ruleIds = (text: string) =>
  analyze(text).findings.map((finding) => finding.ruleId)
const score = (text: string) => analyze(text).score

describe('polish: F-39/F-44 clustered tells and adjectives', () => {
  it('leaves ordinary academic connective tissue alone (B01 was 54)', () => {
    const text =
      'Furthermore, the results show a clear effect. Moreover, the effect grows with dose. In conclusion, the treatment works, and the data support the claim in every tested group.'
    expect(score(text)).toBe(100)
    expect(ruleIds(text)).not.toContain('ai-tells')
  })

  it('leaves a single tell or adjective in its home discipline alone', () => {
    expect(score('The historian delved into the archive for months.')).toBe(100)
    expect(score('The museum shows a rich tapestry of local craft.')).toBe(100)
    expect(score('The sailor navigated the strait at dawn.')).toBe(100)
    expect(score('The geography of the region shapes its landscape.')).toBe(100)
    expect(score('The social worker fostered trust with the family.')).toBe(100)
    expect(score('The dosage is crucial for the treatment.')).toBe(100)
    expect(score('The new API is robust and the documentation is complete.')).toBe(100)
  })

  it('still fires when four distinct tells or three distinct adjectives cluster', () => {
    expect(
      ruleIds(
        'We delve into the tapestry, navigate the realm, and showcase furthermore.',
      ),
    ).toContain('ai-tells')
    expect(
      ruleIds('The crucial, pivotal, and robust framework.'),
    ).toContain('ai-adjectives')
  })
})

describe('polish: F-40/F-41/F-42 sales context for numbers', () => {
  it('leaves reporting sentences alone (B07 was 76, B08 was 63)', () => {
    expect(
      score(
        'Unemployment increased 2% last month, the largest jump since 2021, and youth unemployment rose sharply as well.',
      ),
    ).toBe(100)
    expect(
      score(
        'Revenue grew 12% year over year to $4.2 billion, the company said.',
      ),
    ).toBe(100)
    expect(
      score('Inflation rose 3.2% in June, the third monthly rise in a row.'),
    ).toBe(100)
  })

  it('leaves a price statement alone (C26 was 76)', () => {
    expect(score('100% FREE for every new user.')).toBe(100)
    expect(ruleIds('100% FREE for every new user.')).not.toContain(
      'unsourced-number',
    )
  })

  it('leaves a plain spelled number without selling context alone (B36 was 76)', () => {
    expect(
      score('Over a thousand companies across Germany use it every day.'),
    ).toBe(100)
  })

  it('still flags boastful unsourced numbers', () => {
    expect(ruleIds('We have 10000 users.')).toContain('unsourced-number')
    expect(ruleIds('We serve ten thousand teams.')).toContain(
      'unsourced-number',
    )
    expect(ruleIds('Join a million happy readers.')).toContain(
      'unsourced-number',
    )
    expect(ruleIds('We grew 500% last year.')).toContain('unsourced-number')
    expect(ruleIds('We serve 99.9% more customers.')).toContain(
      'unsourced-number',
    )
    expect(
      ruleIds('10,000 happy users, see https://example.com/pricing.'),
    ).toContain('unsourced-number')
    expect(
      ruleIds('Uptime was 99.9%, according to the 2025 audit report.'),
    ).toContain('unsourced-number')
  })
})

describe('polish: F-43 dialogue dashes', () => {
  it('leaves French line-initial dialogue dashes alone (B11 was 29)', () => {
    const text =
      '— Bonjour, dit Marie.\n— Bonjour, répondit Jean.\n— Il fait beau aujourd’hui.\n— Oui, le soleil brille.\n— Nous allons au marché.\n— J’achète du pain.\n— Et du fromage.\n— Le marché est loin.\n— Nous prenons le bus.\n— Le bus est en retard.\n— Encore une fois.\n— C’est la vie.'
    expect(score(text)).toBe(100)
    expect(ruleIds(text)).not.toContain('em-dash')
    expect(ruleIds(text)).not.toContain('same-length-sentences')
  })

  it('still flags mid-sentence dash slop', () => {
    const dashSlop =
      'The platform is fast — and it is simple. The team is bold — and the work is clean. The design is bright — and the code is tight. The launch is near — and the users are ready. The price is fair — and the value is clear. The support is kind — and the answers are quick. The roadmap is open — and the future is bright. The data is safe — and the servers are fast. The product is ready — and the market is waiting. The story is simple — and the ending is good.'
    expect(ruleIds(dashSlop)).toContain('em-dash')
    // Stage 4: was 36 under raw TTR. The low-ttr penalty depth
    // changed with MATTR (the dash sentences reuse one frame, so
    // MATTR sits further below its threshold than raw TTR sat below
    // its band), moving the score to 34. Still Heavy slop.
    expect(score(dashSlop)).toBe(34)
  })
})

describe('polish: F-45/F-46 literary triplets and anaphora', () => {
  it('leaves two literary adjective triplets alone (B27 was 81)', () => {
    expect(
      score(
        'The old house stood mysterious, dangerous, and beautiful on the hill. The garden grew tangled, neglected, and beautiful in the summer rain.',
      ),
    ).toBe(100)
    expect(
      ruleIds(
        'The old house stood mysterious, dangerous, and beautiful on the hill. The garden grew tangled, neglected, and beautiful in the summer rain.',
      ),
    ).not.toContain('rule-of-three')
  })

  it('still fires rule-of-three on three adjective triplets', () => {
    expect(
      ruleIds(
        'Our platform is efficient, scalable, and reliable. The tool is fast, secure, and simple. The service is modern, smart, and flexible.',
      ),
    ).toContain('rule-of-three')
  })

  it('leaves lyric anaphora alone (B26 was 89)', () => {
    const text =
      'I am the storm. I am the fire. I am the voice that you hear in the night. I am the one who will carry the light.'
    expect(score(text)).toBe(100)
    expect(ruleIds(text)).not.toContain('repeated-openings')
  })

  it('still fires repeated openings on non-pronoun openings', () => {
    expect(
      ruleIds(
        'In the morning, we plan the work. In the afternoon, we build the work. In the evening, we ship the work.',
      ),
    ).toContain('repeated-openings')
  })
})

describe('polish: F-47 specific substance facts', () => {
  it('fires thin-substance when paragraphs carry only a date (C08 was 62)', () => {
    const text =
      'Our platform is truly transformative and helps teams in amazing ways. In January, everything changes for the better and the future looks bright for all.\n\nThe key is to find balance and unlock your potential in a fast-paced world. On Tuesday, you will feel the difference from the very first day.\n\nEverything works seamlessly together to deliver outstanding results for everyone involved. In March, the experience gets even better for every single user. The roadmap is open and the team is ready for the next chapter.'
    expect(ruleIds(text)).toContain('thin-substance')
    expect(score(text)).toBe(38)
  })

  it('fires thin-substance when paragraphs carry only a because (C09 was 72)', () => {
    const text =
      'Our platform is truly transformative because it helps teams in amazing ways every single day and makes everything better. The dashboard shows the numbers and the team watches them every morning.\n\nThe key is to find balance because you will feel the difference from the very first day and everything will change.\n\nEverything works seamlessly together because the future is bright and the possibilities are endless for everyone involved. The launch went well and the users stayed happy all week long.'
    expect(ruleIds(text)).toContain('thin-substance')
    expect(score(text)).toBe(46)
  })

  it('still counts a cause tied to a number or a name as a fact', () => {
    const text =
      'Latency fell because the team cut the payload from 400ms to 90ms. The change shipped on Tuesday and the queue stayed short.\n\nThe migration finished because Ana from support rewrote the queue by hand. The new code runs in half the time it used to take.\n\nThe budget grew because the board approved 2 million euros for the year. The money pays for three new engineers and the servers they need.\n\nThe launch worked because Marek in Berlin tested every page twice. The team fixed the last bugs on Friday and shipped on Monday.'
    expect(ruleIds(text)).not.toContain('thin-substance')
  })
})

describe('polish: F-48 any uncited authority claim fires', () => {
  it('fires on one uncited claim in three (C10 was 100)', () => {
    const text =
      'Studies have shown that rest helps, according to the 2024 WHO report. Experts agree that sleep matters, says Dr. Rao at MIT. Research suggests that water helps.'
    expect(ruleIds(text)).toContain('fake-authority')
    expect(score(text)).toBe(76)
  })
})

describe('polish: F-49 inclusive ratio thresholds', () => {
  it('fires pseudo-wisdom at exactly a third filler (C19 was 89, focus silent)', () => {
    const text =
      'The key is to find balance. True growth comes from within. The report was filed on Tuesday. The team met in March. The budget was approved on Friday. The notes went out the same day.'
    expect(ruleIds(text)).toContain('pseudo-wisdom')
  })

  it('fires transition-stacking at exactly half (C20 was 63, focus silent)', () => {
    const text =
      'Furthermore, the team met on Monday.\n\nMoreover, the engineers checked the database.\n\nThe designer updated the homepage with new photos.\n\nThe manager closed the sprint with a short review.'
    expect(ruleIds(text)).toContain('transition-stacking')
  })
})

describe('polish: F-50 per-sentence formal register', () => {
  it('measures diversity past one legal sentence (D06 was 100)', () => {
    const pad = [
      'The quarterly review covered budgets, hiring, and travel in detail for the board.',
      'Ana from support answered forty tickets, most of them about the new login page.',
      'The migration finished in June and the team in Linz took over the remaining work.',
      'We measured sentence-length variation in 412 published essays and 380 machine-generated essays.',
      'The dataset and the analysis code are available in the project repository for anyone to check.',
      'The Licensor grants the Licensee a non-exclusive licence to use the Software for internal business purposes only.',
      'The river was low that summer, and the town kept to the shade after noon.',
      'He sat on the warm boards and watched the water slide past, slow, brown, and patient.',
      'The server handled 10,000 requests on Tuesday without an error, and the queue peaked at 400 per minute.',
      'Either party may terminate this Agreement by giving thirty days written notice to the other party.',
      'Upon termination, the Licensee shall cease all use of the Software and delete all copies within fourteen days.',
      'The team shipped the update on Thursday evening after the final review, and the notes listed every fix.',
    ].join(' ')
    const draft = pad.repeat(12)
    // Stage 4: low-ttr no longer fires here. Under raw TTR the
    // 2,245-word draft scored 0.059 (the same 12 sentences repeated,
    // so the global ratio collapses with length); under MATTR each
    // 100-word window is as varied as the original 12 sentences
    // (0.758), so the local vocabulary is not narrow. The repetition
    // is still caught — by repeated-bigrams, which is the diversity
    // signal that measures past the legal sentences here (F-50's
    // point stands: the two legal sentences do not exempt the rest).
    expect(ruleIds(draft)).not.toContain('low-ttr')
    expect(ruleIds(draft)).toContain('repeated-bigrams')
    expect(score(draft)).toBe(53)
  })

  it('still leaves a clean legal paragraph alone', () => {
    const legal =
      'The Licensor grants the Licensee a non-exclusive, non-transferable licence to use the Software for internal business purposes only. The Licensee shall not sublicense, distribute, or publicly display the Software without the prior written consent of the Licensor. Either party may terminate this Agreement by giving thirty days written notice to the other party. Upon termination, the Licensee shall cease all use of the Software and delete all copies within fourteen days. This Agreement is governed by the laws of the State of California.'
    expect(score(legal)).toBe(100)
  })
})

describe('polish: F-51 paraphrase coverage', () => {
  it('flags the paraphrase classes that have a pattern (all were 100)', () => {
    const cases: Array<[string, string]> = [
      ['Our platform is world-changing for every team.', 'buzzwords'],
      ['We build on the bleeding edge of technology.', 'buzzwords'],
      ['Our tool is powered by AI and ships daily.', 'buzzwords'],
      ['An AI-driven platform for modern teams.', 'buzzwords'],
      ['In a fast-paced world, teams need tools that work.', 'overused-opener'],
      [
        'In this fast-paced world, teams need tools that simply work.',
        'overused-opener',
      ],
      ['I love this product so much, it is unbelievable.', 'buzzwords'],
      ['The result was mind-blowing for the whole team.', 'buzzwords'],
      ['This is the world’s best tool for the job.', 'vague-superlative'],
      ['It is the best thing ever for our workflow.', 'vague-superlative'],
      ['Our platform changes the game entirely.', 'buzzwords'],
      [
        'We serve 10,000 of the most loyal and dedicated and long-standing users in the country.',
        'unsourced-number',
      ],
      ['We grew five-hundred percent last year.', 'unsourced-number'],
      ['Our tool is 10x faster and 10x cheaper.', 'unsourced-number'],
    ]
    for (const [text, ruleId] of cases) {
      expect(ruleIds(text), text).toContain(ruleId)
    }
  })
})

describe('polish: F-56 evidence link in the next sentence', () => {
  it('clears a number with an evidence link in the next sentence (C42 was 76)', () => {
    expect(
      score(
        'We grew 500% last year. The full details are in the report at https://example.com/reports/survey-2024 for anyone who wants to check.',
      ),
    ).toBe(100)
  })

  it('still flags when the link is two sentences away or is pricing', () => {
    expect(
      ruleIds(
        'We grew 500% last year. The team works hard every single day. See the full report at https://example.com/reports/survey-2024.',
      ),
    ).toContain('unsourced-number')
    expect(
      ruleIds(
        'We grew 500% last year. See https://example.com/pricing for details.',
      ),
    ).toContain('unsourced-number')
  })
})

describe('polish: F-53 inventory counts', () => {
  it('measures 215 distinct vocabulary terms and 131 distinct clichés', () => {
    const vocab = new Set([
      ...BUZZWORD_PHRASES,
      ...AI_TELL_PHRASES,
      ...AI_ADJECTIVE_PHRASES,
      ...STYLE_WORDS_TIER3,
    ])
    const cliche = new Set([
      ...OPENER_PHRASES,
      ...FAKE_AUTHORITY_PHRASES,
      ...PSEUDO_WISDOM_PHRASES,
      ...TEMPLATE_CLOSER_PHRASES,
      ...TESTIMONIAL_PHRASES,
      ...SUPERLATIVE_PHRASES,
      ...SOCIAL_PROOF_PHRASES,
    ])
    // Stage 4: was 165. The suffix completion added 50 listed forms
    // (verb paradigms for unleash, supercharge, empower, leverage,
    // revolutionize, turbocharge, skyrocket, garner, surpass, boast,
    // tapestries, and the tier-3 stems align, emphasize, pioneer,
    // spearhead, champion, orchestrate, cultivate, plus the
    // game-changers / paradigm-shifts / advancement plurals). F20
    // (2026-11-15) added two testimonial cliches ("i love this product
    // so much", "best thing i have ever used"), so the union is 131.
    expect(vocab.size).toBe(215)
    expect(cliche.size).toBe(131)
  })
})
