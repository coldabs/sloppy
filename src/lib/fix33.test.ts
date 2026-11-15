import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'

// F33 (2026-11-15): the same-length-sentences rule fired on a German
// paragraph — a cross-language sentence-rhythm false positive. The
// rhythm thresholds are calibrated on English, so the rhythm rules
// (same-length-sentences and burstiness) do not judge a draft that is
// likely not English. The language check counts function words: a
// draft is non-English when non-English function words outnumber
// English ones, with at least three of them, so a single foreign
// word does not exempt a draft and a tie defaults to English.
describe('F33: non-English text is exempt from sentence rhythm', () => {
  const german =
    'Die Plattform ist revolutionär und nahtlos. Sie hilft Teams bei der täglichen Arbeit. Die Benutzeroberfläche ist intuitiv und schnell. Wir haben sie im März 2024 eingeführt. Seitdem nutzen sie über tausend Unternehmen in ganz Deutschland.'

  it('does not flag the German STRESS3 probe B10', () => {
    const result = analyze(german)
    expect(result.findings.map((f) => f.ruleId)).not.toContain(
      'same-length-sentences',
    )
    expect(result.score).toBe(100)
  })

  it('does not flag a French same-length run', () => {
    const text =
      'La plateforme est révolutionnaire et transparente. Elle aide les équipes dans leur travail quotidien. Interface est intuitive et rapide. Nous avons lancé en mars deux mille vingt-quatre. Depuis, plus de mille entreprises en France utilisent la plateforme.'
    const result = analyze(text)
    expect(result.findings.map((f) => f.ruleId)).not.toContain(
      'same-length-sentences',
    )
  })

  it('does not flag a Spanish same-length run', () => {
    const text =
      'La plataforma es revolucionaria y perfecta. Ayuda a los equipos en su trabajo diario. La interfaz es intuitiva y rápida. La lanzamos en marzo de dos mil veinticuatro. Desde entonces, más de mil empresas en España utilizan la plataforma.'
    const result = analyze(text)
    expect(result.findings.map((f) => f.ruleId)).not.toContain(
      'same-length-sentences',
    )
  })

  it('still flags an English same-length run', () => {
    const text =
      'The platform is revolutionary and seamless. It helps teams with their daily work. The interface is intuitive and fast. We launched it in March twenty twenty-four. Since then, over a thousand companies across the country use the platform.'
    const result = analyze(text)
    expect(result.findings.map((f) => f.ruleId)).toContain(
      'same-length-sentences',
    )
  })

  it('does not exempt an English draft with one foreign word', () => {
    const text =
      'The platform is revolutionary and seamless. It helps teams with their daily work. The interface is intuitive and fast. We launched it with Zeitgeist in March. Since then, over a thousand companies use the platform.'
    const result = analyze(text)
    expect(result.findings.map((f) => f.ruleId)).toContain(
      'same-length-sentences',
    )
  })

  it('does not flag burstiness on a flat German rhythm', () => {
    // Ten uniform German sentences: the CV is 0.0, which would fire
    // burstiness on English text.
    const sentence =
      'Die Mannschaft plant die Arbeit und die Mannschaft baut die Arbeit.'
    const text = Array.from({ length: 10 }, () => sentence).join(' ')
    const result = analyze(text)
    expect(result.findings.map((f) => f.ruleId)).not.toContain('burstiness')
  })
})
