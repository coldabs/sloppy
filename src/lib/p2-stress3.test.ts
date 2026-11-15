// Stress test 3 — P2 copy (28 rules, 7 groups).
// Every probe runs through the real analyze() scorer. First pass: record
// only (band 'any'); bands are pinned after the measured scores are in.
// Never edit engine code to make a probe pass — fix the probe instead.
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
  ttrOf,
} from './rules'

type Band = 'clean' | 'mostly' | 'slop' | 'industrial' | 'any'

interface Probe {
  id: string
  group: string
  text: string
  band: Band
  focus?: string
}

const ruleIds = (text: string) =>
  analyze(text).findings.map((finding) => finding.ruleId)

const hasRule = (text: string, ruleId: string) => ruleIds(text).includes(ruleId)

// Neutral filler sentences of varied length and opening, used only to
// reach a word count for a density-threshold probe. They may fire other
// rules; each probe asserts only the rule it is testing.
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

const padToWords = (text: string, target: number): string => {
  let out = text
  let i = 0
  while (analyze(out).words < target) {
    out += ' ' + PAD_SENTENCES[i % PAD_SENTENCES.length]
    i += 1
  }
  return out
}

const bandOk = (score: number, band: Band): boolean => {
  if (band === 'any') return true
  if (band === 'clean') return score >= 90
  if (band === 'mostly') return score >= 70 && score < 90
  if (band === 'slop') return score >= 20 && score < 70
  return score < 20
}

// (a) Evasion — A01–A30
const evasionProbes: Probe[] = [
  {
    id: 'A01',
    group: 'evasion',
    text: 'Our seam\u200bless platform ships today for every team on the plan.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'A02',
    group: 'evasion',
    text: 'Our se\u0430mless platform ships today for every team on the plan.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'A03',
    group: 'evasion',
    text: 'Our s\u1d07\u1d00\u1d0d\u029f\u1d07ss platform ships today for every team on the plan.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'A04',
    group: 'evasion',
    text: 'Our seam less platform ships today for every team on the plan.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'A05',
    group: 'evasion',
    text: 'Our seam.less platform ships today for every team on the plan.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'A06',
    group: 'evasion',
    text: 'Our seam_less platform ships today for every team on the plan.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'A07',
    group: 'evasion',
    text: 'We délve into the data every week to check the numbers and the trends.',
    band: 'clean',
    focus: 'ai-tells',
  },
  {
    id: 'A08',
    group: 'evasion',
    text: 'Our revo-lutionary platform ships today for every team on the plan.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'A09',
    group: 'evasion',
    text: 'Our ground-breaking platform ships today for every team on the plan.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'A10',
    group: 'evasion',
    text: 'We grew 500% last year, according to a 2024 report.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'A11',
    group: 'evasion',
    text: 'We grew 500% last year, according to the Gartner survey.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'A12',
    group: 'evasion',
    text: 'We grew 500% last year. The market was strong, the team was focused, and the roadmap was clear, according to the 2024 Gartner report.',
    band: 'mostly',
    focus: 'unsourced-number',
  },
  {
    id: 'A13',
    group: 'evasion',
    text: 'We grew 500% last year. See https://example.com/pricing for details.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'A14',
    group: 'evasion',
    text: 'We grew 500% last year. See https://example.com/reports/survey-2024 for details.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'A15',
    group: 'evasion',
    text: 'Our platform serves 10,000 happy users every single day.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'A16',
    group: 'evasion',
    text: 'Our platform serves 999 happy users every single day.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'A17',
    group: 'evasion',
    text: 'Our platform serves 1,000 happy users every single day.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'A18',
    group: 'evasion',
    text: 'Our platform serves ten thousand happy users every single day.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'A19',
    group: 'evasion',
    text: 'Our platform serves a million happy readers every single day.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'A20',
    group: 'evasion',
    text: 'Last Tuesday the server handled 10,000 requests in one hour.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'A21',
    group: 'evasion',
    text: 'The recipe calls for two percent milk and a pinch of salt.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'A22',
    group: 'evasion',
    text: 'We grew five hundred percent last year and the team celebrated.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'A23',
    group: 'evasion',
    text: 'Our accuracy is 99% and the dashboard shows the number every morning.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'A24',
    group: 'evasion',
    text: 'We are SOC 2 compliant. See the audit at https://example.com/reports/soc2-audit-2024 for the full report.',
    band: 'clean',
    focus: 'trust-claim',
  },
  {
    id: 'A25',
    group: 'evasion',
    text: 'We are SOC 2 compliant. See https://example.com/pricing for plans and details.',
    band: 'slop',
    focus: 'trust-claim',
  },
  {
    id: 'A26',
    group: 'evasion',
    text: 'Our service is 100% secure and your data is safe with us always.',
    band: 'slop',
    focus: 'trust-claim',
  },
  {
    id: 'A27',
    group: 'evasion',
    text: 'Our service delivers 99.9% uptime for every customer on the plan.',
    band: 'slop',
    focus: 'trust-claim',
  },
  {
    id: 'A28',
    group: 'evasion',
    text: 'The platform is fast -- and it is simple. The team is bold -- and the work is clean. The design is bright -- and the code is tight. The launch is near -- and the users are ready. The price is fair -- and the value is clear. The support is kind -- and the answers are quick. The roadmap is open -- and the future is bright. The data is safe -- and the servers are fast. The product is ready -- and the market is waiting. The story is simple -- and the ending is good.',
    band: 'slop',
    focus: 'em-dash',
  },
  {
    id: 'A29',
    group: 'evasion',
    text: 'The platform is fast – and it is simple. The team is bold – and the work is clean. The design is bright – and the code is tight. The launch is near – and the users are ready. The price is fair – and the value is clear. The support is kind – and the answers are quick. The roadmap is open – and the future is bright. The data is safe – and the servers are fast. The product is ready – and the market is waiting. The story is simple – and the ending is good.',
    band: 'slop',
    focus: 'em-dash',
  },
  {
    id: 'A30',
    group: 'evasion',
    text: 'The well-known platform is fast-paced and user-friendly in every way it works for teams today.',
    band: 'clean',
    focus: 'em-dash',
  },
]

// (b) False positives on clean human text — B01–B35
const falsePositiveProbes: Probe[] = [
  {
    id: 'B01',
    group: 'false-positive',
    text: 'Furthermore, the results show a clear effect. Moreover, the effect grows with dose. In conclusion, the treatment works, and the data support the claim in every tested group.',
    band: 'clean',
    focus: 'ai-tells',
  },
  {
    id: 'B02',
    group: 'false-positive',
    text: 'The Licensor grants the Licensee a non-exclusive, non-transferable licence to use the Software for internal business purposes only. The Licensee shall not sublicense, distribute, or publicly display the Software without the prior written consent of the Licensor. Either party may terminate this Agreement by giving thirty days written notice to the other party. Upon termination, the Licensee shall cease all use of the Software and delete all copies within fourteen days. This Agreement is governed by the laws of the State of California.',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'B03',
    group: 'false-positive',
    text: 'The new API is robust and the documentation covers the full landscape of the service. The robust design handles errors well and the team keeps it stable.',
    band: 'clean',
    focus: 'ai-adjectives',
  },
  {
    id: 'B04',
    group: 'false-positive',
    text: 'The river was low that summer, and the town kept to the shade after noon. Tom came down to the landing with a fishing pole over his shoulder and a tin pail in his hand, whistling a tune his father had taught him years before, when the mill was still running and the boats still stopped here. He sat on the warm boards and watched the water slide past — slow, brown, and patient — and thought about nothing in particular, which suited him fine. By evening the heat had broken, and the first cool wind off the river smelled of rain — the kind of rain that comes down hard for ten minutes and then stops, leaving the dust settled and the air clean. He walked home past the closed shops and the dark windows of the schoolhouse, counting his steps the way he always did when he had nothing else to count. His mother was waiting on the porch with supper on the table and a look that said she had already heard about the fish he had not caught.',
    band: 'clean',
    focus: 'em-dash',
  },
  {
    id: 'B05',
    group: 'false-positive',
    text: 'Hi Ana, the invoice for March is attached. The total is 1,240 euros, due on 28 March. Please check the hours on page 2 — I logged 14 hours on the migration and 6 on the review. Let me know if anything looks wrong. Thanks, Marek',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'B06',
    group: 'false-positive',
    text: 'Inflation rose 3.2% in June, the third monthly rise in a row, and food prices climbed 1.1% in the same month.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'B07',
    group: 'false-positive',
    text: 'Unemployment increased 2% last month, the largest jump since 2021, and youth unemployment rose sharply as well.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'B08',
    group: 'false-positive',
    text: 'Revenue grew 12% year over year to $4.2 billion, and the company added 300 staff in the quarter.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'B09',
    group: 'false-positive',
    text: 'The battery is at 50% and the phone needs charging before the trip.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'B10',
    group: 'false-positive',
    text: 'Die Plattform ist revolutionär und nahtlos. Sie hilft Teams bei der täglichen Arbeit. Die Benutzeroberfläche ist intuitiv und schnell. Wir haben sie im März 2024 eingeführt. Seitdem nutzen sie über tausend Unternehmen in ganz Deutschland.',
    band: 'mostly',
    focus: 'clean',
  },
  {
    id: 'B11',
    group: 'false-positive',
    text: '— Bonjour, dit Marie.\n— Bonjour, répondit Jean.\n— Il fait beau aujourd\u2019hui.\n— Oui, le soleil brille.\n— Nous allons au marché.\n— J\u2019achète du pain.\n— Et du fromage.\n— Le marché est loin.\n— Nous prenons le bus.\n— Le bus est en retard.\n— Encore une fois.\n— C\u2019est la vie.',
    band: 'clean',
    focus: 'em-dash',
  },
  {
    id: 'B12',
    group: 'false-positive',
    text: 'ঢাকা শহরে আজ বৃষ্টি হচ্ছে। মানুষ ছাতা নিয়ে বের হয়েছে। রাস্তায় পানি জমেছে। দোকানগুলোতে ভিড় কম।',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'B13',
    group: 'false-positive',
    text: 'The landscape of the valley changed slowly after the river moved its course, and the old farms gave way to new fields.',
    band: 'clean',
    focus: 'ai-adjectives',
  },
  {
    id: 'B14',
    group: 'false-positive',
    text: 'The programme aims to foster independence in young people leaving care, and it pairs each of them with a mentor.',
    band: 'clean',
    focus: 'ai-adjectives',
  },
  {
    id: 'B15',
    group: 'false-positive',
    text: 'In this essay we delve into the archives to trace how the port grew from a fishing village into a trading town.',
    band: 'clean',
    focus: 'ai-tells',
  },
  {
    id: 'B16',
    group: 'false-positive',
    text: 'The exhibition presents a rich tapestry of colour and pattern drawn from three centuries of weaving in the region.',
    band: 'clean',
    focus: 'ai-tells',
  },
  {
    id: 'B17',
    group: 'false-positive',
    text: 'We navigate the channel at dawn, when the tide is with us, and anchor off the point before noon.',
    band: 'clean',
    focus: 'ai-tells',
  },
  {
    id: 'B18',
    group: 'false-positive',
    text: 'The exhibition will showcase thirty paintings from the collection, including works never shown in public before.',
    band: 'clean',
    focus: 'ai-tells',
  },
  {
    id: 'B19',
    group: 'false-positive',
    text: 'It is crucial that patients take the full course of medicine, even when they start to feel better.',
    band: 'clean',
    focus: 'ai-adjectives',
  },
  {
    id: 'B20',
    group: 'false-positive',
    text: 'Best day ever!!!',
    band: 'mostly',
    focus: 'hype-punctuation',
  },
  {
    id: 'B21',
    group: 'false-positive',
    text: 'EXPERIENCE\n\nSenior designer, 2019 to 2024. Led the team that rebuilt the checkout flow and cut errors by half.',
    band: 'clean',
    focus: 'shouting-caps',
  },
  {
    id: 'B22',
    group: 'false-positive',
    text: 'FREE SHIPPING on all orders placed before Friday, with delivery in two working days.',
    band: 'clean',
    focus: 'shouting-caps',
  },
  {
    id: 'B23',
    group: 'false-positive',
    text: 'Set MAX_RETRIES to 3 and TIMEOUT_MS to 5000 in the config file before you run the job.',
    band: 'clean',
    focus: 'shouting-caps',
  },
  {
    id: 'B24',
    group: 'false-positive',
    text: 'Version 2.0 fixes the login bug, adds a dark mode toggle, and improves the export speed for large files.',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'B25',
    group: 'false-positive',
    text: 'Find all solutions to the equation x squared plus 3 equals 7, and show your working for each step.',
    band: 'clean',
    focus: 'vague-solution',
  },
  {
    id: 'B26',
    group: 'false-positive',
    text: 'I am the storm. I am the fire. I am the voice that you hear in the night. I am the one who will carry the light.',
    band: 'clean',
    focus: 'repeated-openings',
  },
  {
    id: 'B27',
    group: 'false-positive',
    text: 'The old house stood mysterious, dangerous, and beautiful on the hill. The garden grew tangled, neglected, and beautiful in the summer rain.',
    band: 'clean',
    focus: 'rule-of-three',
  },
  {
    id: 'B28',
    group: 'false-positive',
    text: 'In conclusion, the novel shows how grief changes a family, and the final chapter returns to the house where it began.',
    band: 'clean',
    focus: 'ai-tells',
  },
  {
    id: 'B29',
    group: 'false-positive',
    text: 'Add 500 g flour, 200 ml water, and 10 g salt. Knead for ten minutes, then leave the dough to rise for one hour.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'B30',
    group: 'false-positive',
    text: 'The team won 3-2 after extra time, with the winning goal scored in the final minute of the match.',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'B31',
    group: 'false-positive',
    text: 'There is a 40% chance of rain tomorrow, with winds up to 20 miles per hour and temperatures near freezing.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'B32',
    group: 'false-positive',
    text: '40% of voters support the plan, up 2 points from last month, while 35% oppose it and the rest are undecided.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'B33',
    group: 'false-positive',
    text: 'We measured sentence-length variation in 412 published essays and 380 machine-generated essays written between January and June 2024. Human essays showed a mean sentence length of 18.4 words with a standard deviation of 11.2 words. Machine-generated essays averaged 17.9 words with a standard deviation of 6.1 words. The difference in variance was significant at p < 0.01. These results suggest that variance, rather than mean length, separates the two groups in this corpus. The dataset and the analysis code are available in the project repository.',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'B34',
    group: 'false-positive',
    text: 'Last Tuesday the server handled 10,000 requests in one hour.',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'B35',
    group: 'false-positive',
    text: 'Explore the codebase.',
    band: 'clean',
    focus: 'generic-cta',
  },
  {
    id: 'B36',
    group: 'false-positive',
    text: 'Over a thousand companies across Germany use it every day.',
    band: 'clean',
    focus: 'unsourced-number',
  },
]

// (c) False negatives — slop that should score low but might not — C01–C40
const falseNegativeProbes: Probe[] = [
  {
    id: 'C01',
    group: 'false-negative',
    text: 'The team plans the work. The team builds the work and ships it when the review is done and the tests pass. The team reviews the work. The team plans the next work for the week and the team builds it with care. The team ships the work. The team reviews the work and the team plans the work again for the next week. The team builds the work. The team ships the work and the team reviews it. The team plans the work. The team builds the work and ships it when the review is done.',
    band: 'slop',
    focus: 'burstiness',
  },
  {
    id: 'C02',
    group: 'false-negative',
    text: 'Our tool is world-changing for every team that uses it daily.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'C03',
    group: 'false-negative',
    text: 'We work on the bleeding edge of the field, where others fear to go.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'C04',
    group: 'false-negative',
    text: 'Our platform is powered by AI and helps teams move faster every day.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'C05',
    group: 'false-negative',
    text: 'Our AI-driven platform helps teams move faster every single day.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'C06',
    group: 'false-negative',
    text: 'In a fast-paced world, teams need tools that simply work without fuss or delay.',
    band: 'mostly',
    focus: 'overused-opener',
  },
  {
    id: 'C07',
    group: 'false-negative',
    text: 'In this fast-paced world, teams need tools that simply work without fuss or delay.',
    band: 'mostly',
    focus: 'overused-opener',
  },
  {
    id: 'C08',
    group: 'false-negative',
    text: 'Our platform is truly transformative and helps teams in amazing ways. In January, everything changes for the better and the future looks bright for all.\n\nThe key is to find balance and unlock your potential in a fast-paced world. On Tuesday, you will feel the difference from the very first day.\n\nEverything works seamlessly together to deliver outstanding results for everyone involved. In March, the experience gets even better for every single user. The roadmap is open and the team is ready for the next chapter.',
    band: 'slop',
    focus: 'thin-substance',
  },
  {
    id: 'C09',
    group: 'false-negative',
    text: 'Our platform is truly transformative because it helps teams in amazing ways every single day and makes everything better. The dashboard shows the numbers and the team watches them every morning.\n\nThe key is to find balance because you will feel the difference from the very first day and everything will change.\n\nEverything works seamlessly together because the future is bright and the possibilities are endless for everyone involved. The launch went well and the users stayed happy all week long.',
    band: 'slop',
    focus: 'thin-substance',
  },
  {
    id: 'C10',
    group: 'false-negative',
    text: 'Studies have shown that rest helps, according to the 2024 WHO report. Experts agree that sleep matters, says Dr. Rao at MIT. Research suggests that water helps.',
    band: 'mostly',
    focus: 'fake-authority',
  },
  {
    id: 'C11',
    group: 'false-negative',
    text: padToWords(
      'The plan is simple — we ship on Friday. The launch is ready — and the team is set. The work is done — and the notes are out.',
      200,
    ),
    band: 'clean',
    focus: 'em-dash',
  },
  {
    id: 'C12',
    group: 'false-negative',
    text: 'The plan is simple — we ship on Friday. The team is ready — and the work is done.',
    band: 'clean',
    focus: 'em-dash',
  },
  {
    id: 'C13a',
    group: 'false-negative',
    text: padToWords(
      'Our platform is efficient, scalable, and reliable. The tool is fast, secure, and simple.',
      420,
    ),
    band: 'slop',
    focus: 'rule-of-three',
  },
  {
    id: 'C13b',
    group: 'false-negative',
    text: 'Our platform is efficient, scalable, and reliable. The tool is fast, secure, and simple. The service is modern, smart, and flexible.',
    band: 'mostly',
    focus: 'rule-of-three',
  },
  {
    id: 'C14',
    group: 'false-negative',
    text: 'The team met on Monday. Ana shipped the build on Tuesday. Marek reviewed the changes on Wednesday.',
    band: 'clean',
    focus: 'same-length-sentences',
  },
  {
    id: 'C15',
    group: 'false-negative',
    text: 'The team met on Monday. Ana shipped the build on Tuesday morning. The team reviewed it. Marek closed the sprint on Thursday.',
    band: 'clean',
    focus: 'same-length-sentences',
  },
  {
    id: 'C16',
    group: 'false-negative',
    text: 'The team met on Monday morning. The team shipped the build on Tuesday. Ana reviewed the changes on Wednesday. Marek closed the sprint.',
    band: 'clean',
    focus: 'repeated-openings',
  },
  {
    id: 'C17',
    group: 'false-negative',
    text: 'She worked quickly and carefully through the long list of tickets.',
    band: 'clean',
    focus: 'adverb-density',
  },
  {
    id: 'C18',
    group: 'false-negative',
    text: 'The notably holistic draft was a careful approach to the work.',
    band: 'clean',
    focus: 'style-words',
  },
  {
    id: 'C19',
    group: 'false-negative',
    text: 'The key is to find balance. True growth comes from within. The report was filed on Tuesday. The team met in March. The budget was approved on Friday. The notes went out the same day.',
    band: 'mostly',
    focus: 'pseudo-wisdom',
  },
  {
    id: 'C20',
    group: 'false-negative',
    text: 'Furthermore, the team met on Monday.\n\nMoreover, the engineers checked the database.\n\nThe designer updated the homepage with new photos.\n\nThe manager closed the sprint with a short review.',
    band: 'mostly',
    focus: 'transition-stacking',
  },
  {
    id: 'C21',
    group: 'false-negative',
    text: 'The team plans the work every week. The team builds the work every week. The team ships the work every week. The team reviews the work every week. The team plans the next work. The team builds the next work. The team ships the next work.',
    band: 'mostly',
    focus: 'burstiness',
  },
  {
    id: 'C22',
    group: 'false-negative',
    text: 'The quarterly review covered budgets, hiring, travel, training, and the new office plan in detail for the board. The migration finished in June and the team in Linz took over the remaining work after the handover. The dataset and the analysis code are available in the project repository for anyone to check freely. Upon termination, the Licensee shall cease all use of the Software and delete all copies within fourteen days. The server handled 10,000 requests on Tuesday without an error, and the queue peaked at 400 per minute. Either party may terminate this Agreement by giving thirty days written notice to the other party involved. Ana from support answered forty tickets, most of them about the new login page and the password reset. The team shipped the update on Thursday evening after the final review, and the notes listed every fix.',
    band: 'clean',
    focus: 'burstiness',
  },
  {
    id: 'C23',
    group: 'false-negative',
    text: 'The team plans the work every week. '.repeat(11) + 'The team.',
    band: 'mostly',
    focus: 'low-ttr',
  },
  {
    id: 'C24',
    group: 'false-negative',
    text: 'The login page is new and the login page has a fresh design that the team tested with real users in March. The update covers the checkout flow, the search box, the settings screen, and the help centre, all of which were rebuilt from scratch. Ana from support answered forty tickets about the changes, most of them about passwords and the new two-step sign-in. The release went out on Thursday evening after the final review, and the notes listed every fix in plain language for the customers.',
    band: 'clean',
    focus: 'repeated-bigrams',
  },
  {
    id: 'C25',
    group: 'false-negative',
    text: 'AMAZING deal, only today, while stocks last, so hurry and grab yours now.',
    band: 'clean',
    focus: 'shouting-caps',
  },
  {
    id: 'C26',
    group: 'false-negative',
    text: '100% FREE for every new user, no card needed, cancel anytime you like.',
    band: 'clean',
    focus: 'trust-claim',
  },
  {
    id: 'C27',
    group: 'false-negative',
    text: 'This is amazing \u{1F600}\u{1F600}\u{1F600} and everyone loves it so much today.',
    band: 'clean',
    focus: 'hype-punctuation',
  },
  {
    id: 'C28',
    group: 'false-negative',
    text: 'I love this product so much, it is wonderful and I use it every single day.',
    band: 'clean',
    focus: 'testimonial-cliche',
  },
  {
    id: 'C29',
    group: 'false-negative',
    text: 'The results were unbelievable and the team was thrilled with the outcome.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'C30',
    group: 'false-negative',
    text: 'It was a mind-blowing experience from start to finish, and we all loved it.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'C31',
    group: 'false-negative',
    text: "This is the world's best coffee, made fresh every morning in our little shop.",
    band: 'slop',
    focus: 'vague-superlative',
  },
  {
    id: 'C32',
    group: 'false-negative',
    text: 'This is the best thing ever, and I cannot stop talking about it to my friends.',
    band: 'mostly',
    focus: 'vague-superlative',
  },
  {
    id: 'C33',
    group: 'false-negative',
    text: 'Our tool changes the game entirely for small teams that need to move fast.',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'C34',
    group: 'false-negative',
    text: 'Not just the speed. It is about trust, and the team knows it well.',
    band: 'clean',
    focus: 'not-just',
  },
  {
    id: 'C35',
    group: 'false-negative',
    text: 'Click here to read the documentation and the full guide for the new release.',
    band: 'clean',
    focus: 'generic-cta',
  },
  {
    id: 'C36',
    group: 'false-negative',
    text: '## DOWNLOAD NOW\n\nThe new version is out today with faster exports and a cleaner design for everyone.',
    band: 'clean',
    focus: 'generic-cta',
  },
  {
    id: 'C37',
    group: 'false-negative',
    text: 'We serve 500 customers across the country, and most of them joined this year.',
    band: 'clean',
    focus: 'unsourced-number',
  },
  {
    id: 'C38',
    group: 'false-negative',
    text: 'We serve 10,000 of the most loyal and dedicated and long-standing users in the country.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'C39',
    group: 'false-negative',
    text: 'We grew five-hundred percent last year and the team celebrated the news.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'C40',
    group: 'false-negative',
    text: 'Our tool is 10x faster and 10x cheaper than the old one, and the team loves it.',
    band: 'slop',
    focus: 'unsourced-number',
  },
  {
    id: 'C41',
    group: 'false-negative',
    text: 'We d\u0435lve into the data every week to check the numbers.',
    band: 'clean',
    focus: 'ai-tells',
  },
  {
    id: 'C42',
    group: 'false-negative',
    text: 'We grew 500% last year. The full details are in the report at https://example.com/reports/survey-2024 for anyone who wants to check.',
    band: 'clean',
    focus: 'unsourced-number',
  },
]

// (d) Scoring / length / caps edge cases — D01–D15
const edgeProbes: Probe[] = [
  {
    id: 'D03',
    group: 'edge',
    text: 'Hello',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'D04',
    group: 'edge',
    text: 'seamless',
    band: 'slop',
    focus: 'buzzwords',
  },
  {
    id: 'D05',
    group: 'edge',
    text: 'delve',
    band: 'clean',
    focus: 'ai-tells',
  },
  {
    id: 'D06',
    group: 'edge',
    text: PAD_SENTENCES.join(' ').repeat(12),
    band: 'slop',
    focus: 'clean-long',
  },
  {
    id: 'D07',
    group: 'edge',
    text: exampleDraft.repeat(4),
    band: 'industrial',
    focus: 'slop-long',
  },
  {
    id: 'D08',
    group: 'edge',
    text: 'SALE ENDS TODAY. Everything must go before the shop closes on Sunday.',
    band: 'slop',
    focus: 'shouting-caps',
  },
  {
    id: 'D09',
    group: 'edge',
    text: '## GET STARTED\n\nPaste your draft into the box and the checker lists every matched phrase.',
    band: 'clean',
    focus: 'generic-cta',
  },
  {
    id: 'D10',
    group: 'edge',
    text: 'seamless '.repeat(100) + PAD_SENTENCES.join(' ').repeat(5),
    band: 'industrial',
    focus: 'density-saturation',
  },
  {
    id: 'D11',
    group: 'edge',
    text: '\u{1F600}\u{1F600}\u{1F600}\u{1F600}',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'D12',
    group: 'edge',
    text: '10 20 30 40 50',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'D13',
    group: 'edge',
    text: '| Name | Score | Date |\n|------|-------|------|\n| Ana | 95 | March |\n| Bo | 88 | April |\n| Cy | 92 | May |\n| Di | 90 | June |',
    band: 'clean',
    focus: 'same-length-sentences',
  },
  {
    id: 'D14',
    group: 'edge',
    text: '```\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\n```\nThe code above sets four constants for the test.',
    band: 'clean',
    focus: 'clean',
  },
  {
    id: 'D15',
    group: 'edge',
    text:
      'The ' +
      Array.from({ length: 5000 }, (_, i) => `item${i}`).join(' ') +
      ' arrived.',
    band: 'clean',
    focus: 'single-sentence',
  },
  {
    id: 'D16',
    group: 'edge',
    text: PAD_SENTENCES.filter((_, i) => i !== 5 && i !== 10)
      .join(' ')
      .repeat(12),
    band: 'slop',
    focus: 'low-ttr',
  },
  {
    id: 'D17',
    group: 'edge',
    text: [
      falsePositiveProbes[32].text,
      falsePositiveProbes[3].text,
      falsePositiveProbes[4].text,
      falsePositiveProbes[1].text,
    ].join('\n\n'),
    band: 'clean',
    focus: 'clean-long',
  },
]

// (e) Performance — E01–E10 (timed, not scored)
const perfProbes: Array<{ id: string; text: string; note: string }> = [
  {
    id: 'E01',
    text: PAD_SENTENCES.join(' ').repeat(12),
    note: '~20k chars clean',
  },
  {
    id: 'E02',
    text: exampleDraft.repeat(4),
    note: '~20k chars slop',
  },
  {
    id: 'E03',
    text: 'not just '.repeat(2000),
    note: 'not-just pattern with no twist (ReDoS probe)',
  },
  {
    id: 'E04',
    text: 'more fast, more secure, and more simple. '.repeat(500),
    note: 'rule-of-three more-pattern repeated',
  },
  {
    id: 'E05',
    text: 'word — '.repeat(2500),
    note: '2500 em-dash pauses',
  },
  {
    id: 'E06',
    text: '!'.repeat(5000),
    note: '5000 exclamation marks',
  },
  {
    id: 'E07',
    text: 'Our accuracy is 99%. See https://example.com/reports/survey-2024 for details. '.repeat(
      300,
    ),
    note: '300 evidence links with numbers',
  },
  {
    id: 'E08',
    text: '\u{1F600}'.repeat(5000),
    note: '5000 emoji',
  },
  {
    id: 'E09',
    text: "it's ".repeat(3000),
    note: '3000 apostrophes',
  },
  {
    id: 'E10',
    text: PAD_SENTENCES.join(' ').repeat(60),
    note: '~100k chars clean',
  },
]

const allProbes: Probe[] = [
  ...evasionProbes,
  ...falsePositiveProbes,
  ...falseNegativeProbes,
  ...edgeProbes,
]

describe('stress test 3 (P2)', () => {
  it('records the measured score for every probe', () => {
    const failures: string[] = []
    console.log('id | words | score | verdict | rules')
    for (const probe of allProbes) {
      const result = analyze(probe.text)
      const rules = [
        ...new Set(result.findings.map((finding) => finding.ruleId)),
      ].join(',')
      console.log(
        `${probe.id} | ${result.words} | ${result.score} | ${result.verdict} | ${rules || '-'}`,
      )
      if (!bandOk(result.score, probe.band)) {
        failures.push(
          `${probe.id}: score ${result.score} not in band ${probe.band}`,
        )
      }
      if (probe.focus && probe.focus !== 'clean' && probe.focus !== 'clean-long' && probe.focus !== 'slop-long' && probe.focus !== 'density-saturation' && probe.focus !== 'single-sentence') {
        const fired = hasRule(probe.text, probe.focus)
        console.log(`  focus ${probe.focus}: ${fired ? 'FIRED' : 'silent'}`)
      }
    }
    console.log(`probes: ${allProbes.length}`)
    expect(failures).toEqual([])
  })

  it('empty and whitespace-only drafts score nothing', () => {
    for (const text of ['', '   \n\t  ']) {
      const result = analyze(text)
      expect(result.empty).toBe(true)
      expect(result.score).toBe(100)
      expect(result.verdict).toBe('Nothing to score')
      expect(result.findings).toEqual([])
    }
  })

  it('checks the P2 inventory claims', () => {
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
    console.log(`vocab distinct: ${vocab.size}, cliche distinct: ${cliche.size}`)
    console.log(
      `burstiness clean abstract: ${burstinessOf(falsePositiveProbes[32].text).value.toFixed(3)}, ttr: ${ttrOf(falsePositiveProbes[32].text).toFixed(3)}`,
    )
    expect(vocab.size).toBeGreaterThanOrEqual(150)
    expect(cliche.size).toBeGreaterThanOrEqual(120)
  })

  it('runs every performance probe in bounded time', () => {
    for (const probe of perfProbes) {
      const start = performance.now()
      const result = analyze(probe.text)
      const ms = performance.now() - start
      console.log(
        `${probe.id} (${probe.note}): ${result.words} words, ${result.score} score, ${ms.toFixed(1)} ms`,
      )
      expect(ms).toBeLessThan(5000)
    }
  })
})
