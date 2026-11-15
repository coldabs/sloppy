// Stage 4 — bounded wildcard gaps, morphological suffixes, MATTR,
// unsourced-number hype-context corroboration, the widened
// burstiness gate, and the per-group rules split (docs/dev-notes/AUDIT.md §7
// stage 4). Numbers below were measured from the new code.
import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'
import { exampleDraft } from './exampleDraft'
import {
  AI_TELL_PHRASES,
  BUZZWORD_PHRASES,
  burstinessOf,
  mattrOf,
  rules,
  ttrOf,
} from './rules'
import { claimsRules } from './rules/claims'
import { diversityRules } from './rules/diversity'
import { actionsRules } from './rules/actions'
import { formatRules } from './rules/format'
import { structureRules } from './rules/structure'
import { substanceRules } from './rules/substance'
import { voiceRules } from './rules/voice'

const ruleIds = (text: string) =>
  analyze(text).findings.map((finding) => finding.ruleId)
const score = (text: string) => analyze(text).score

// Sentences of near-identical length with varied vocabulary, for
// the burstiness probes: the word list rotates with an index suffix
// so no bigram repeats and the vocabulary stays wide — the only
// signal is the rhythm.
const uniformCadence = (lengths: number[]): string =>
  lengths
    .map((n, i) => {
      const vocab = [
        'morning', 'quarter', 'harbour', 'ledger', 'meadow', 'copper',
        'bridge', 'lantern', 'orchard', 'signal', 'valley', 'market',
        'harvest', 'cinder', 'marble', 'willow', 'anchor', 'compass',
        'timber', 'meadowlark',
      ]
      const words = Array.from(
        { length: n - 1 },
        (_, k) => vocab[(i * 3 + k * 7) % vocab.length] + (i * 20 + k),
      )
      const first = words[0].slice(0, 1).toUpperCase() + words[0].slice(1)
      return [first, ...words.slice(1)].join(' ') + '.'
    })
    .join(' ')

const PAD_SENTENCES = [
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
]

describe('stage 4: bounded wildcard gaps', () => {
  it('fires on one-, two-, and three-word gaps in a phrase', () => {
    // The audit's gap case: a two-word modifier inserted into
    // "unlock your * potential" used to break detection.
    expect(ruleIds('Unlock your full potential today.')).toContain('ai-tells')
    expect(ruleIds('Unlock your full true potential today.')).toContain(
      'ai-tells',
    )
    expect(
      ruleIds('Unlock your full true shining potential today.'),
    ).toContain('ai-tells')
  })

  it('does not fire on a four-word gap, proving the bound', () => {
    expect(
      ruleIds('Unlock your full true shining endless potential today.'),
    ).not.toContain('ai-tells')
    expect(
      score('Unlock your full true shining endless potential today.'),
    ).toBe(100)
  })

  it('still fires "not just a fast tool, but…" (own regex, not phraseSource)', () => {
    expect(
      ruleIds('This is not just a fast tool, but a complete platform.'),
    ).toContain('not-just')
  })
})

describe('stage 4: morphological suffixes', () => {
  // Every added form fires in a plain frame, with a near-miss word
  // that stays silent as its clean control. Direct phrases fire on
  // their own; the cluster-gated ones are tested separately below.
  const directForms: Array<[string, string, string, string]> = [
    // [form, rule, firing frame, clean control word]
    ['unleashes', 'buzzwords', 'The update unleashes faster workflows.', 'leases'],
    ['unleashed', 'buzzwords', 'The update unleashed faster workflows.', 'leashed'],
    ['unleashing', 'buzzwords', 'The update is unleashing faster workflows.', 'leasing'],
    ['supercharges', 'buzzwords', 'The update supercharges every workflow.', 'charges'],
    ['supercharged', 'buzzwords', 'The supercharged update ships today.', 'charged'],
    ['supercharging', 'buzzwords', 'The update is supercharging every workflow.', 'charging'],
    ['revolutionizes', 'buzzwords', 'The update revolutionizes every workflow.', 'revolutions'],
    ['revolutionized', 'buzzwords', 'The update revolutionized every workflow.', 'revolution'],
    ['turbocharges', 'buzzwords', 'The update turbocharges every workflow.', 'turbos'],
    ['turbocharging', 'buzzwords', 'The update is turbocharging every workflow.', 'charging'],
    ['skyrocketed', 'buzzwords', 'Our growth skyrocketed last quarter.', 'rocketed'],
    ['empowers', 'buzzwords', 'The tool empowers every team.', 'powers'],
    ['empowered', 'buzzwords', 'The empowered team shipped on time.', 'powered'],
    ['empowering', 'buzzwords', 'The tool is empowering every team.', 'powering'],
    ['leverages', 'buzzwords', 'The tool leverages every signal.', 'levers'],
    ['leveraged', 'buzzwords', 'The leveraged buyout closed in June.', 'levered'],
    ['leveraging', 'buzzwords', 'The tool is leveraging every signal.', 'levering'],
    ['elevates your', 'buzzwords', 'This elevates your work today.', 'elevates the'],
    ['elevating your', 'buzzwords', 'This is elevating your work today.', 'elevating the'],
    ['game changers', 'buzzwords', 'We build game changers for teams.', 'game players'],
    ['paradigm shifts', 'buzzwords', 'The paradigm shifts keep coming.', 'paradigm changes'],
    ['garners', 'ai-tells', 'The report garners praise from readers.', 'gardens'],
    ['surpassed', 'ai-tells', 'The result surpassed every target.', 'passed'],
    ['boasted', 'ai-tells', 'The founder boasted about the launch.', 'coasted'],
    ['intricately', 'ai-tells', 'The intricately woven cloth took months.', 'delicately'],
  ]
  for (const [form, rule, frame, control] of directForms) {
    it(`fires on "${form}" and stays silent on "${control}"`, () => {
      expect(ruleIds(frame), form).toContain(rule)
      expect(
        ruleIds(`We tested the ${control} draft.`),
        control,
      ).not.toContain(rule)
    })
  }

  it('fires on "tapestries" in a cluster, like "tapestry"', () => {
    // The audit's plural gap: "tapestry" fired in a 4-cluster,
    // "tapestries" was silent. Both are one lemma now.
    const cluster = (word: string) =>
      `Furthermore, the results show a clear effect. Moreover, the effect grows with dose. In conclusion, the treatment works, and the ${word} of evidence supports the claim. We delve into the data every week.`
    expect(ruleIds(cluster('tapestry'))).toContain('ai-tells')
    expect(ruleIds(cluster('tapestries'))).toContain('ai-tells')
  })

  it('leaves a lone "tapestries" alone, like a lone "tapestry"', () => {
    expect(
      ruleIds('The exhibition presents a rich tapestries of colour.'),
    ).not.toContain('ai-tells')
    expect(
      ruleIds('The exhibition presents a rich tapestry of colour.'),
    ).not.toContain('ai-tells')
  })

  it('still fires on "delving" in a cluster (already listed, must not break)', () => {
    const text =
      'Furthermore, the results show a clear effect. Moreover, the effect grows with dose. In conclusion, the treatment works. We are delving into the data every week to check the numbers.'
    expect(ruleIds(text)).toContain('ai-tells')
  })

  it('does not add inflected "dive into" (literal diving would fire)', () => {
    // Deliberately skipped: "diving into the pool" is ordinary
    // English, and "diving into" is a direct (non-clustered) phrase,
    // so adding it would flag swimmers. The base form stays as it was.
    expect(ruleIds('She went diving into the pool at noon.')).not.toContain(
      'ai-tells',
    )
    expect(ruleIds('We dive into the data every week.')).toContain('ai-tells')
  })

  it('counts tier-3 suffix forms by lemma, not by form', () => {
    // One stem in three forms is one term, not a cluster.
    expect(
      ruleIds('Align the text. The aligned columns look tidy. Aligning the grid takes an hour.'),
    ).not.toContain('style-words')
    // "emphasize" and "emphasise" are one lemma: with only "notably"
    // beside them, that is two lemmas, not three.
    expect(
      ruleIds('We emphasize the point. The emphasise note was clear. Notably, the work finished on time.'),
    ).not.toContain('style-words')
    // Three distinct lemmas still fire.
    expect(
      ruleIds('The align plan was notably holistic and comprehensive.'),
    ).toContain('style-words')
  })
})

describe('stage 4: MATTR replaces raw TTR', () => {
  const academicAbstract =
    'We measured sentence-length variation in 412 published essays and 380 machine-generated essays written between January and June 2024. Human essays showed a mean sentence length of 18.4 words with a standard deviation of 11.2 words. Machine-generated essays averaged 17.9 words with a standard deviation of 6.1 words. The difference in variance was significant at p < 0.01. These results suggest that variance, rather than mean length, separates the two groups in this corpus. The dataset and the analysis code are available in the project repository.'
  const repetitiveSameWords =
    'The team plans the work every week. The team builds the work every week. The team ships the work every week. The team reviews the work every week. The team plans the next work every week. The team builds the next work every week. The team ships the next work every week. The team reviews the next work every week. The team plans the work and the team builds the work. The team ships the work and the team reviews the work. The team plans the work for the week. The team builds the work for the week. The team ships the work for the week. The team reviews the work for the week. The team plans the work, the team builds the work, the team ships the work, and the team reviews the work. The team plans the work every week and the team ships the work every week.'

  it('measures clean above the 0.60 threshold and repetitive below it', () => {
    // Calibration: clean abstract 0.685, repeated draft 0.530.
    expect(mattrOf(academicAbstract)).toBeGreaterThan(0.6)
    expect(mattrOf(repetitiveSameWords)).toBeLessThan(0.6)
    expect(mattrOf(exampleDraft.repeat(4))).toBeLessThan(0.6)
    expect(ruleIds(academicAbstract)).not.toContain('low-ttr')
    expect(ruleIds(repetitiveSameWords)).toContain('low-ttr')
    expect(ruleIds(exampleDraft.repeat(4))).toContain('low-ttr')
  })

  it('does not fire on short drafts, however repetitive', () => {
    const short = 'The team plans the work. '.repeat(6)
    expect(analyze(short).words).toBeLessThan(80)
    expect(ruleIds(short)).not.toContain('low-ttr')
  })

  it('has no cliff at 200/500 words: repeating varied text does not narrow it', () => {
    // Raw TTR on the PAD text collapses with length (0.59 once,
    // 0.059 repeated twelve times); MATTR stays put, because every
    // 100-word window is as varied as the original twelve sentences.
    const pad = PAD_SENTENCES.join(' ')
    const repeated = pad.repeat(12)
    expect(ttrOf(pad)).toBeGreaterThan(0.5)
    expect(ttrOf(repeated)).toBeLessThan(0.1)
    expect(mattrOf(pad)).toBeGreaterThan(0.6)
    expect(mattrOf(repeated)).toBeGreaterThan(0.6)
    expect(Math.abs(mattrOf(pad) - mattrOf(repeated))).toBeLessThan(0.05)
    expect(ruleIds(repeated)).not.toContain('low-ttr')
    // The global repetition is still caught, by repeated-bigrams.
    expect(ruleIds(repeated)).toContain('repeated-bigrams')
  })

  it('still fires on a long repetitive draft', () => {
    const long =
      'The team plans the work every week. The team builds the work every week. '.repeat(
        20,
      )
    expect(analyze(long).words).toBeGreaterThan(200)
    expect(ruleIds(long)).toContain('low-ttr')
  })
})

describe('stage 4: unsourced-number hype-context corroboration', () => {
  it('still flags hype numbers', () => {
    expect(ruleIds('We serve 10m users every day.')).toContain(
      'unsourced-number',
    )
    expect(ruleIds('Join 10m users today.')).toContain('unsourced-number')
    expect(ruleIds('Our platform delivers 10m happy users.')).toContain(
      'unsourced-number',
    )
    expect(ruleIds('We grew to 10m users last year.')).toContain(
      'unsourced-number',
    )
    expect(ruleIds('Our tool is 10x faster than the old one.')).toContain(
      'unsourced-number',
    )
    expect(ruleIds('Our accuracy is 99% and the dashboard shows it.')).toContain(
      'unsourced-number',
    )
  })

  it('leaves financial and academic suffixed figures alone', () => {
    // The gate doing the work: none of these is a reporting
    // sentence (no change verb) and none has a citation — the only
    // reason they stay clean is the hype-context requirement.
    expect(ruleIds('Revenue was $4.2b last quarter.')).not.toContain(
      'unsourced-number',
    )
    expect(
      ruleIds('The study enrolled 10m participants in the trial.'),
    ).not.toContain('unsourced-number')
    expect(
      ruleIds('The fund manages $10m in assets for clients.'),
    ).not.toContain('unsourced-number')
    // A claim noun on its own is data, not a boast.
    expect(ruleIds('The report lists 10m users in the appendix.')).not.toContain(
      'unsourced-number',
    )
    expect(score('Revenue was $4.2b last quarter.')).toBe(100)
  })

  it('keeps the reporting-sentence and plain-number exemptions', () => {
    expect(
      score('Unemployment increased 2% last month, the largest jump since 2021.'),
    ).toBe(100)
    expect(
      score('Revenue grew 12% year over year to $4.2 billion.'),
    ).toBe(100)
    expect(
      ruleIds('Last Tuesday the server handled 10,000 requests in one hour.'),
    ).not.toContain('unsourced-number')
    expect(ruleIds('The battery is at 50%.')).not.toContain(
      'unsourced-number',
    )
  })
})

describe('stage 4: widened burstiness gate', () => {
  it('catches the uniform 18–24-word cadence the old cap missed', () => {
    const cadence = uniformCadence([18, 20, 22, 24, 19, 21, 23, 18, 20, 22])
    expect(burstinessOf(cadence).value).toBeLessThan(0.12)
    expect(burstinessOf(cadence).mean).toBeGreaterThan(16)
    expect(ruleIds(cadence)).toContain('burstiness')
    expect(ruleIds(uniformCadence([24, 24, 24, 24, 24, 24, 24, 24, 24, 24]))).toContain(
      'burstiness',
    )
  })

  it('still catches the short-sentence run', () => {
    expect(
      ruleIds(uniformCadence([13, 13, 13, 13, 13, 13, 13, 13, 13, 13])),
    ).toContain('burstiness')
  })

  it('leaves clean text alone, including the 8-sentence C22 run', () => {
    // C22: eight PAD sentences, mean 17.8, CV 0.024 — uniform enough
    // to fire on variance alone, but only eight sentences, below the
    // ten-sentence minimum for long-sentence runs.
    const c22 =
      'The quarterly review covered budgets, hiring, travel, training, and the new office plan in detail for the board. The migration finished in June and the team in Linz took over the remaining work after the handover. The dataset and the analysis code are available in the project repository for anyone to check freely. Upon termination, the Licensee shall cease all use of the Software and delete all copies within fourteen days. The server handled 10,000 requests on Tuesday without an error, and the queue peaked at 400 per minute. Either party may terminate this Agreement by giving thirty days written notice to the other party involved. Ana from support answered forty tickets, most of them about the new login page and the password reset. The team shipped the update on Thursday evening after the final review, and the notes listed every fix.'
    expect(burstinessOf(c22).value).toBeLessThan(0.12)
    expect(ruleIds(c22)).not.toContain('burstiness')
    expect(score(c22)).toBeGreaterThanOrEqual(90)
    const abstract =
      'We measured sentence-length variation in 412 published essays and 380 machine-generated essays written between January and June 2024. Human essays showed a mean sentence length of 18.4 words with a standard deviation of 11.2 words. Machine-generated essays averaged 17.9 words with a standard deviation of 6.1 words. The difference in variance was significant at p < 0.01.'
    expect(ruleIds(abstract)).not.toContain('burstiness')
  })

  it('documents the cost: a nine-sentence uniform run still escapes', () => {
    expect(
      ruleIds(uniformCadence([20, 20, 20, 20, 20, 20, 20, 20, 20])),
    ).not.toContain('burstiness')
  })
})

describe('stage 4: rules split into per-group modules', () => {
  it('keeps twenty-nine rules in the original order from the barrel', () => {
    expect(rules).toHaveLength(29)
    expect(rules.map((rule) => rule.id)).toEqual([
      'em-dash', 'buzzwords', 'ai-tells', 'ai-adjectives', 'style-words',
      'overused-opener', 'template-closer', 'not-just', 'hype-punctuation',
      'unsourced-number', 'trust-claim', 'social-proof',
      'testimonial-cliche', 'vague-superlative', 'fake-authority',
      'generic-cta', 'urgency-scarcity', 'vague-solution', 'shouting-caps',
      'same-length-sentences', 'repeated-openings', 'adverb-density',
      'rule-of-three', 'burstiness', 'low-ttr', 'repeated-bigrams',
      'transition-stacking', 'thin-substance', 'pseudo-wisdom',
    ])
    expect(rules.map((rule) => rule.group)).toEqual([
      ...Array(9).fill('voice'),
      ...Array(6).fill('claims'),
      ...Array(3).fill('actions'),
      'format',
      ...Array(4).fill('structure'),
      ...Array(4).fill('diversity'),
      ...Array(2).fill('substance'),
    ])
  })

  it('assembles the barrel from the per-group modules, same objects', () => {
    expect(rules).toEqual([
      ...voiceRules,
      ...claimsRules,
      ...actionsRules,
      ...formatRules,
      ...structureRules,
      ...diversityRules,
      ...substanceRules,
    ])
    expect(voiceRules).toHaveLength(9)
    expect(claimsRules).toHaveLength(6)
    expect(actionsRules).toHaveLength(3)
    expect(formatRules).toHaveLength(1)
    expect(structureRules).toHaveLength(4)
    expect(diversityRules).toHaveLength(4)
    expect(substanceRules).toHaveLength(2)
  })

  it('re-exports the phrase lists and metrics from the barrel', () => {
    expect(BUZZWORD_PHRASES).toContain('skyrocketed')
    expect(AI_TELL_PHRASES).toContain('tapestries')
    expect(typeof mattrOf).toBe('function')
    expect(typeof burstinessOf).toBe('function')
    expect(typeof ttrOf).toBe('function')
  })
})
