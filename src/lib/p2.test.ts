import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'
import { exampleDraft } from './exampleDraft'
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
  burstinessOf,
  rules,
  ttrOf,
} from './rules'

const ruleIds = (text: string) =>
  analyze(text).findings.map((finding) => finding.ruleId)

export const cleanCorpus: Array<[string, string]> = [
  [
    'academic abstract',
    'We measured sentence-length variation in 412 published essays and 380 machine-generated essays written between January and June 2024. Human essays showed a mean sentence length of 18.4 words with a standard deviation of 11.2 words. Machine-generated essays averaged 17.9 words with a standard deviation of 6.1 words. The difference in variance was significant at p < 0.01. These results suggest that variance, rather than mean length, separates the two groups in this corpus. The dataset and the analysis code are available in the project repository.',
  ],
  [
    'legal paragraph',
    'The Licensor grants the Licensee a non-exclusive, non-transferable licence to use the Software for internal business purposes only. The Licensee shall not sublicense, distribute, or publicly display the Software without the prior written consent of the Licensor. Either party may terminate this Agreement by giving thirty days written notice to the other party. Upon termination, the Licensee shall cease all use of the Software and delete all copies within fourteen days. This Agreement is governed by the laws of the State of California.',
  ],
  [
    'technical documentation',
    'Install the package with npm install @coldabs/sloppy. Run npx sloppy check draft.txt to score a file. The command prints a score from 0 to 100 and lists every matched phrase with its line number. Use the --json flag to print the result as JSON. The configuration file is sloppy.config.json in the project root. It accepts two keys: rules, a list of rule ids to enable, and threshold, the minimum score that passes the check. Exit code 0 means the draft passed; exit code 1 means it did not.',
  ],
  [
    'literary prose, dash-heavy',
    'The river was low that summer, and the town kept to the shade after noon. Tom came down to the landing with a fishing pole over his shoulder and a tin pail in his hand, whistling a tune his father had taught him years before, when the mill was still running and the boats still stopped here. He sat on the warm boards and watched the water slide past — slow, brown, and patient — and thought about nothing in particular, which suited him fine. By evening the heat had broken, and the first cool wind off the river smelled of rain — the kind of rain that comes down hard for ten minutes and then stops, leaving the dust settled and the air clean. He walked home past the closed shops and the dark windows of the schoolhouse, counting his steps the way he always did when he had nothing else to count. His mother was waiting on the porch with supper on the table and a look that said she had already heard about the fish he had not caught.',
  ],
  [
    'short business email',
    'Hi Ana, the invoice for March is attached. The total is 1,240 euros, due on 28 March. Please check the hours on page 2 — I logged 14 hours on the migration and 6 on the review. Let me know if anything looks wrong. Thanks, Marek',
  ],
  [
    'clean landing page',
    'Paste your draft into the box. The checker lists every matched phrase, shows the rule it broke, and gives a score from 0 to 100. Nothing is uploaded: the whole check runs in your browser. It reads plain text and Markdown. It does not read images, PDFs, or spreadsheets.',
  ],
]

const repetitiveCleanVocab =
  'The team met on Monday morning to review the plan. The engineers checked the database before the deploy. The manager wrote the release notes after lunch. The designer updated the homepage with new photos. The support team answered forty tickets during the day. The analysts prepared the weekly report for Friday. The developers fixed three bugs in the checkout flow. The writer drafted the help page for new users. The team shipped the update on Thursday evening. The manager closed the sprint with a short review.'

const repetitiveSameWords =
  'The team plans the work every week. The team builds the work every week. The team ships the work every week. The team reviews the work every week. The team plans the next work every week. The team builds the next work every week. The team ships the next work every week. The team reviews the next work every week. The team plans the work and the team builds the work. The team ships the work and the team reviews the work. The team plans the work for the week. The team builds the work for the week. The team ships the work for the week. The team reviews the work for the week. The team plans the work, the team builds the work, the team ships the work, and the team reviews the work. The team plans the work every week and the team ships the work every week.'

describe('P2: vocabulary inventory', () => {
  it('has 150+ distinct tiered vocabulary terms', () => {
    const vocab = new Set([
      ...BUZZWORD_PHRASES,
      ...AI_TELL_PHRASES,
      ...AI_ADJECTIVE_PHRASES,
      ...STYLE_WORDS_TIER3,
    ])
    expect(vocab.size).toBeGreaterThanOrEqual(150)
    expect(BUZZWORD_PHRASES.length).toBeGreaterThanOrEqual(60)
    expect(AI_TELL_PHRASES.length).toBeGreaterThanOrEqual(45)
    expect(STYLE_WORDS_TIER3.length).toBeGreaterThanOrEqual(20)
  })

  it('flags every new buzzword, AI tell, and AI adjective', () => {
    const added: Array<[string, string]> = [
      ['revolutionize', 'buzzwords'],
      ['revolutionizing', 'buzzwords'],
      ['turbocharge', 'buzzwords'],
      ['turbocharged', 'buzzwords'],
      ['future-proof', 'buzzwords'],
      ['future proof', 'buzzwords'],
      ['next-level', 'buzzwords'],
      ['top-tier', 'buzzwords'],
      ['top tier', 'buzzwords'],
      ['market-leading', 'buzzwords'],
      ['award-winning', 'buzzwords'],
      ['unprecedented', 'buzzwords'],
      ['unmatched', 'buzzwords'],
      ['unrivaled', 'buzzwords'],
      ['unrivalled', 'buzzwords'],
      ['unbeatable', 'buzzwords'],
      ['trailblazing', 'buzzwords'],
      ['skyrocket', 'buzzwords'],
      ['skyrockets', 'buzzwords'],
      ['skyrocketing', 'buzzwords'],
      ['one-of-a-kind', 'buzzwords'],
      ['one of a kind', 'buzzwords'],
      ['second to none', 'buzzwords'],
      ['second-to-none', 'buzzwords'],
      ['like never before', 'buzzwords'],
      ['like no other', 'buzzwords'],
      ['world-changing', 'buzzwords'],
      ['world changing', 'buzzwords'],
      ['bleeding edge', 'buzzwords'],
      ['bleeding-edge', 'buzzwords'],
      ['powered by ai', 'buzzwords'],
      ['ai-driven', 'buzzwords'],
      ['ai driven', 'buzzwords'],
      ['unbelievable', 'buzzwords'],
      ['mind-blowing', 'buzzwords'],
      ['mind blowing', 'buzzwords'],
      ['changes the game', 'buzzwords'],
      ['change the game', 'buzzwords'],
      ['changing the game', 'buzzwords'],
      ['delved', 'ai-tells'],
      ['embarked', 'ai-tells'],
      ['navigated', 'ai-tells'],
      ['showcase', 'ai-tells'],
      ['showcases', 'ai-tells'],
      ['showcased', 'ai-tells'],
      ['showcasing', 'ai-tells'],
      ['underscore', 'ai-tells'],
      ['underscores', 'ai-tells'],
      ['underscored', 'ai-tells'],
      ['underscoring', 'ai-tells'],
      ['intricate', 'ai-tells'],
      ['intricacies', 'ai-tells'],
      ['intricacy', 'ai-tells'],
      ['meticulous', 'ai-tells'],
      ['meticulously', 'ai-tells'],
      ['commendable', 'ai-tells'],
      ['garner', 'ai-tells'],
      ['garnered', 'ai-tells'],
      ['garnering', 'ai-tells'],
      ['surpass', 'ai-tells'],
      ['surpasses', 'ai-tells'],
      ['surpassing', 'ai-tells'],
      ['boast', 'ai-tells'],
      ['boasts', 'ai-tells'],
      ['boasting', 'ai-tells'],
      ['quintessential', 'ai-adjectives'],
      ['exemplary', 'ai-adjectives'],
      ['unwavering', 'ai-adjectives'],
      ['steadfast', 'ai-adjectives'],
      ['paramount', 'ai-adjectives'],
      ['fostered', 'ai-adjectives'],
      ['fostering', 'ai-adjectives'],
    ]
    for (const [term, ruleId] of added) {
      // Clustered tells and adjectives only fire in a cluster, so
      // each is tested inside one: four distinct clustered tells, or
      // four distinct adjectives. Buzzwords fire on their own.
      const probe =
        ruleId === 'ai-tells'
          ? `We tested the ${term} draft, delving into the tapestry as we navigate the realm.`
          : ruleId === 'ai-adjectives'
            ? `We tested the ${term} draft, crucial and pivotal to foster a robust framework.`
            : `We tested the ${term} draft.`
      expect(ruleIds(probe), `term: ${term}`).toContain(ruleId)
    }
  })

  it('leaves a single clustered tell or adjective alone', () => {
    // One clustered tell in ordinary prose is not a signal.
    for (const term of [
      'furthermore',
      'moreover',
      'in conclusion',
      'delve',
      'tapestry',
      'navigate',
      'showcase',
      'embark',
      'realm',
    ]) {
      expect(
        ruleIds(`We tested the ${term} draft.`),
        `tell alone: ${term}`,
      ).not.toContain('ai-tells')
    }
    // One adjective in its home discipline is not a signal.
    for (const term of [
      'crucial',
      'pivotal',
      'foster',
      'robust',
      'landscape',
      'quintessential',
      'exemplary',
      'unwavering',
      'steadfast',
      'paramount',
    ]) {
      expect(
        ruleIds(`We tested the ${term} draft.`),
        `adjective alone: ${term}`,
      ).not.toContain('ai-adjectives')
    }
    // Four distinct clustered tells together are the signal.
    expect(
      ruleIds(
        'We delve into the tapestry, navigate the realm, and showcase furthermore.',
      ),
    ).toContain('ai-tells')
    // Three distinct adjectives together are the signal.
    expect(
      ruleIds('The crucial, pivotal, and robust framework.'),
    ).toContain('ai-adjectives')
  })

  it('flags tier-3 style words only in a cluster', () => {
    // One tier-3 word alone is ordinary writing.
    for (const term of STYLE_WORDS_TIER3) {
      expect(
        ruleIds(`We tested the ${term} draft.`),
        `term alone: ${term}`,
      ).not.toContain('style-words')
    }
    // Three or more distinct tier-3 terms together are the signal.
    const clustered =
      'The notably holistic and comprehensive draft was pioneering. ' +
      'The team took an additionally remarkable and undoubtedly exceptional approach. ' +
      'The profoundly extraordinary results were invaluable and indispensable. ' +
      'The cultivated and orchestrated launch was championed by the group. ' +
      'The plan aligns with the advancements, emphasizing the notable work. ' +
      'The spearheaded effort was spearheading the change, consequently and ultimately. ' +
      'The profound approach was emphasising the right things.'
    expect(ruleIds(clustered)).toContain('style-words')
  })

  it('leaves a single tier-3 word in a clean sentence alone', () => {
    expect(
      analyze('Technological advancements in battery design continued in 2024.').score,
    ).toBe(100)
    expect(
      ruleIds('The policy aligns with the 2024 guidelines.'),
    ).not.toContain('style-words')
  })
})

describe('P2: cliché inventory', () => {
  it('has 120+ distinct cliché phrases', () => {
    const cliche = new Set([
      ...OPENER_PHRASES,
      ...FAKE_AUTHORITY_PHRASES,
      ...PSEUDO_WISDOM_PHRASES,
      ...TEMPLATE_CLOSER_PHRASES,
      ...TESTIMONIAL_PHRASES,
      ...SUPERLATIVE_PHRASES,
      ...SOCIAL_PROOF_PHRASES,
    ])
    expect(cliche.size).toBeGreaterThanOrEqual(120)
  })

  it('flags every new opener, closer, testimonial, superlative, and social-proof phrase', () => {
    const added: Array<[string, string]> = [
      ['picture this', 'overused-opener'],
      ['imagine this', 'overused-opener'],
      ['in the digital age', 'overused-opener'],
      ['in the modern world', 'overused-opener'],
      ['in our modern world', 'overused-opener'],
      ['in this day and age', 'overused-opener'],
      ['have you ever', 'overused-opener'],
      ['what if i told you', 'overused-opener'],
      ['the truth is', 'overused-opener'],
      ['listen up', 'overused-opener'],
      ['dear reader', 'overused-opener'],
      ['once upon a time', 'overused-opener'],
      ['it is no secret that', 'overused-opener'],
      ['there is no denying that', 'overused-opener'],
      ['needless to say', 'overused-opener'],
      ['in a fast-paced world', 'overused-opener'],
      ['in a fast paced world', 'overused-opener'],
      ['in this fast-paced world', 'overused-opener'],
      ['in this fast paced world', 'overused-opener'],
      ['to sum up', 'template-closer'],
      ['to summarize', 'template-closer'],
      ['in summary', 'template-closer'],
      ['in closing', 'template-closer'],
      ['all in all', 'template-closer'],
      ['to wrap up', 'template-closer'],
      ['wrapping up', 'template-closer'],
      ['in a nutshell', 'template-closer'],
      ['long story short', 'template-closer'],
      ['thanks for reading', 'template-closer'],
      ['stay tuned', 'template-closer'],
      ['until next time', 'template-closer'],
      ['that is all', 'template-closer'],
      ['let me know what you think', 'template-closer'],
      ['game changer for me', 'testimonial-cliche'],
      ['changed the game', 'testimonial-cliche'],
      ['could not be happier', 'testimonial-cliche'],
      ["couldn't be happier", 'testimonial-cliche'],
      ['highly recommend', 'testimonial-cliche'],
      ['worth every penny', 'testimonial-cliche'],
      ['best purchase ever', 'testimonial-cliche'],
      ['i wish i had found this sooner', 'testimonial-cliche'],
      ['total game-changer', 'testimonial-cliche'],
      ['best in the world', 'vague-superlative'],
      ['best ever', 'vague-superlative'],
      ['the very best', 'vague-superlative'],
      ['number one', 'vague-superlative'],
      ['number 1', 'vague-superlative'],
      ['top rated', 'vague-superlative'],
      ['top-rated', 'vague-superlative'],
      ['highest rated', 'vague-superlative'],
      ['most popular', 'vague-superlative'],
      ["world's best", 'vague-superlative'],
      ['best thing ever', 'vague-superlative'],
      ['join the thousands', 'social-proof'],
      ['loved by millions', 'social-proof'],
      ['trusted by millions', 'social-proof'],
      ['used by millions', 'social-proof'],
      ['join the millions', 'social-proof'],
      ['loved by thousands', 'social-proof'],
      ['trusted by thousands', 'social-proof'],
    ]
    for (const [phrase, ruleId] of added) {
      expect(ruleIds(`We saw ${phrase}.`), `phrase: ${phrase}`).toContain(ruleId)
    }
  })

  it('flags every fake-authority phrase when uncited', () => {
    for (const phrase of FAKE_AUTHORITY_PHRASES) {
      expect(
        ruleIds(`${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} that rest helps.`),
        `phrase: ${phrase}`,
      ).toContain('fake-authority')
    }
  })

  it('leaves a cited authority claim alone', () => {
    expect(
      ruleIds(
        'Studies have shown that exercise helps, according to the 2024 WHO report.',
      ),
    ).not.toContain('fake-authority')
    expect(
      ruleIds('Experts agree that sleep matters, says Dr. Rao at MIT.'),
    ).not.toContain('fake-authority')
  })

  it('fires on any uncited authority claim', () => {
    // One uncited claim in a draft of three is still a made-up
    // authority: the old rule needed more than half uncited, so a
    // single fake citation in a mostly honest draft slipped through.
    // (The claims are separated by a full sentence, so the
    // neighbouring citations cannot bleed across the 60-character
    // named-citation window.)
    expect(
      ruleIds(
        'Studies have shown that exercise helps, according to the 2024 WHO report. The team spent the whole afternoon reviewing the numbers and checking every chart. Research suggests that rest helps, according to the 2024 WHO report. The engineers rebuilt the dashboard from scratch over the weekend. Experts agree that sleep matters.',
      ),
    ).toContain('fake-authority')
    // One of two uncited, with the other cited, still fires — on the
    // uncited claim only.
    const oneOfTwo = analyze(
      'Studies have shown that exercise helps, according to the 2024 WHO report. The team spent the whole afternoon reviewing the numbers and checking every chart. Experts agree that sleep matters.',
    )
    expect(
      oneOfTwo.findings.filter((f) => f.ruleId === 'fake-authority'),
    ).toHaveLength(1)
  })

  it('flags pseudo-wisdom only when at least a third of the sentences are filler', () => {
    const filler =
      'The key is to find balance. True growth comes from within. The report was filed on Tuesday.'
    expect(ruleIds(filler)).toContain('pseudo-wisdom')
    const oneFiller =
      'The key is to find balance. The report was filed on Tuesday. The team met in March.'
    expect(ruleIds(oneFiller)).not.toContain('pseudo-wisdom')
  })

  it('flags every pseudo-wisdom phrase in a filler passage', () => {
    const texts = [
      "The key is to find balance. True growth comes from within. It's not about the destination, it's about the journey. Success is a journey, not a destination. At the end of the day, the team went home. When it comes down to it, the work is done.",
      'The bottom line is that we must try harder. Remember to be kind to yourself. Believe in yourself. Anything is possible. The sky is the limit. Dream big.',
      'Stay positive. Good things take time. Life is too short. Follow your dreams. Never give up. Live laugh love.',
    ]
    for (const text of texts) {
      expect(
        analyze(text).findings.filter((f) => f.ruleId === 'pseudo-wisdom'),
      ).toHaveLength(6)
    }
  })
})

describe('P2: diversity', () => {
  it('measures burstiness and type-token ratio as expected on the calibration texts', () => {
    // Measured on the P2 calibration corpus: clean human text
    // 0.17–0.35, a run of near-identical short sentences 0.08.
    expect(burstinessOf(repetitiveCleanVocab).value).toBeLessThan(0.12)
    expect(burstinessOf(cleanCorpus[0][1]).value).toBeGreaterThan(0.12)
    expect(ttrOf(repetitiveSameWords)).toBeLessThan(0.2)
    expect(ttrOf(cleanCorpus[0][1])).toBeGreaterThan(0.6)
  })

  it('flags flat sentence rhythm on the repetitive probe', () => {
    const result = analyze(repetitiveCleanVocab)
    expect(ruleIds(repetitiveCleanVocab)).toContain('burstiness')
    // Baseline (P1) was 93 with same-length sentences alone.
    expect(result.score).toBeLessThan(93)
    expect(result.score).toBeGreaterThanOrEqual(80)
  })

  it('does not flag burstiness on clean, legal, or technical text', () => {
    for (const [name, text] of cleanCorpus) {
      expect(ruleIds(text), name).not.toContain('burstiness')
    }
  })

  it('flags a narrow vocabulary range on the same-words probe', () => {
    expect(ruleIds(repetitiveSameWords)).toContain('low-ttr')
    expect(ruleIds(repetitiveSameWords)).toContain('repeated-bigrams')
    // Baseline (P1) for this text is driven by same-length alone;
    // P2 diversity must move it a long way down.
    expect(analyze(repetitiveSameWords).score).toBeLessThan(80)
  })

  it('does not flag type-token ratio or bigrams on clean text', () => {
    for (const [name, text] of cleanCorpus) {
      expect(ruleIds(text), name).not.toContain('low-ttr')
      expect(ruleIds(text), name).not.toContain('repeated-bigrams')
    }
  })

  it('does not measure diversity on short drafts', () => {
    expect(ruleIds('The team plans the work. The team builds the work.')).not.toContain(
      'burstiness',
    )
    expect(ruleIds('The team plans the work. The team builds the work.')).not.toContain(
      'low-ttr',
    )
  })

  it('flags transition stacking when most paragraphs open with one', () => {
    const stacked =
      'Furthermore, the team met on Monday.\n\nMoreover, the engineers checked the database.\n\nAdditionally, the manager wrote the notes.\n\nThe designer updated the homepage.'
    expect(ruleIds(stacked)).toContain('transition-stacking')
    const varied =
      'The team met on Monday.\n\nFurthermore, the engineers checked the database.\n\nThe designer updated the homepage.\n\nThe manager closed the sprint.'
    expect(ruleIds(varied)).not.toContain('transition-stacking')
  })
})

describe('P2: substance', () => {
  it('flags substance-poor paragraphs', () => {
    const thin =
      'Our platform is truly transformative and it helps teams in amazing ways every single day. It makes every workflow smoother and every meeting shorter.\n\nThe key is to find balance and unlock your potential in a fast-paced world. You will feel the difference from the very first day.\n\nEverything works seamlessly together to deliver outstanding results for everyone involved. No other tool does so much for so many people.\n\nIn March 2024, the team in Berlin shipped version 2.1 after fixing 14 bugs.'
    expect(ruleIds(thin)).toContain('thin-substance')
    const concrete =
      'In March 2024, the team in Berlin shipped version 2.1 after fixing 14 bugs. The Berlin team fixed 14 bugs in version 2.1.\n\nThe server handled 10,000 requests on Tuesday without an error. The queue peaked at 400 requests per minute on Tuesday.\n\nAna from support answered 40 tickets, most of them about the new login page. Ana answered 40 tickets and closed 12 of them the same day.\n\nThe next release is planned for June, when the migration finishes. The migration finishes in June and the team in Linz takes over.'
    expect(ruleIds(concrete)).not.toContain('thin-substance')
  })

  it('does not count a bare boastful number as substance', () => {
    const boastful =
      'Our platform delivers 99.9% uptime and serves 10,000 happy users. It is the best choice for every team and every workflow. The future is bright and the possibilities are endless.\n\nWe grew 500% last year and our accuracy is 99%. Our numbers keep climbing and our customers keep smiling. Growth is our middle name and success is our habit.\n\nJoin thousands of teams who trust us every day. Everyone loves the experience and nobody wants to go back. Come and see what all the excitement is about.'
    expect(ruleIds(boastful)).toContain('thin-substance')
    expect(ruleIds(boastful)).toContain('unsourced-number')
  })

  it('counts a sourced number as substance', () => {
    const sourced =
      'Uptime was 99.9%, according to the 2025 Gartner audit report. The Gartner report is linked in the release notes.\n\nThe server handled 10,000 requests on Tuesday without an error. The queue peaked at 400 requests per minute on Tuesday.\n\nAna from support answered 40 tickets, most of them about the new login page. Ana answered 40 tickets and closed 12 of them the same day.\n\nThe next release is planned for June, when the migration finishes. The migration finishes in June and the team in Linz takes over.'
    expect(ruleIds(sourced)).not.toContain('thin-substance')
    expect(ruleIds(sourced)).not.toContain('unsourced-number')
  })

  it('does not judge substance on short or single-paragraph drafts', () => {
    expect(
      ruleIds('Our platform is truly transformative and helps teams every day.'),
    ).not.toContain('thin-substance')
  })
})

describe('P2: structure calibration', () => {
  it('leaves dash-heavy literary prose and a single dash alone', () => {
    const literary = cleanCorpus[3][1]
    expect(ruleIds(literary)).not.toContain('em-dash')
    expect(analyze(literary).score).toBeGreaterThanOrEqual(90)
    expect(ruleIds('Hi Ana, the invoice is attached. Please check page 2 — I logged 14 hours.')).not.toContain(
      'em-dash',
    )
  })

  it('leaves command-line flags alone', () => {
    expect(ruleIds(cleanCorpus[2][1])).not.toContain('em-dash')
    expect(analyze(cleanCorpus[2][1]).score).toBe(100)
  })

  it('flags dash-heavy slop', () => {
    const dashSlop =
      'The platform is fast — and it is simple. The team is bold — and the work is clean. The design is bright — and the code is tight. The launch is near — and the users are ready. The price is fair — and the value is clear. The support is kind — and the answers are quick. The roadmap is open — and the future is bright. The data is safe — and the servers are fast. The product is ready — and the market is waiting. The story is simple — and the ending is good.'
    expect(ruleIds(dashSlop)).toContain('em-dash')
    expect(analyze(dashSlop).score).toBeLessThan(70)
  })

  it('flags rule-of-three autopilot, but not one triplet or a noun list', () => {
    const triplets =
      'Our platform is efficient, scalable, and reliable. The tool is fast, secure, and simple. The service is modern, smart, and flexible.'
    expect(ruleIds(triplets)).toContain('rule-of-three')
    expect(
      ruleIds('Our platform is efficient, scalable, and reliable.'),
    ).not.toContain('rule-of-three')
    expect(
      ruleIds('Buy apples, oranges, and bananas. Get milk, bread, and eggs.'),
    ).not.toContain('rule-of-three')
  })
})

describe('P2: clean corpus and no regressions', () => {
  it('scores every clean corpus text at 90 or above', () => {
    for (const [name, text] of cleanCorpus) {
      const result = analyze(text)
      expect(result.score, name).toBeGreaterThanOrEqual(90)
    }
  })

  it('keeps the existing clean cases at 100', () => {
    expect(analyze('Explore the codebase.').score).toBe(100)
    expect(
      analyze('NASA and the FBI published the joint report in March 2024.').score,
    ).toBe(100)
    expect(
      analyze(
        'We are SOC 2 compliant. See the audit at https://example.com/reports/soc2-audit-2024 for the full report.',
      ).score,
    ).toBe(100)
    expect(
      analyze('Last Tuesday the server handled 10,000 requests in one hour.').score,
    ).toBe(100)
  })

  it('keeps the built-in example draft in Industrial slop', () => {
    expect(analyze(exampleDraft).score).toBeLessThan(15)
  })

  it('has twenty-nine rules across seven groups', () => {
    expect(rules.length).toBe(29)
    const groups = new Set(rules.map((rule) => rule.group))
    expect(groups.size).toBe(7)
  })
})
