// F69 — claims.ts was 847 lines because the lexicons lived with the
// logic. The lists moved to rules/claimsLexicon.ts; this test pins
// every phrase entry so a dropped entry is caught, and pins the
// lexicon sizes so a dropped word is caught.
import { describe, expect, it } from 'vitest'
import {
  FAKE_AUTHORITY_PHRASES,
  SOCIAL_PROOF_PHRASES,
  SUPERLATIVE_PHRASES,
  TESTIMONIAL_PHRASES,
  claimsRules,
} from './rules/claims'
import {
  BOAST_ADJECTIVES,
  CHANGE_VERBS,
  CLAIM_NOUNS,
  CLAIM_VERBS,
  MAGNITUDE_VALUE,
  REPORTING_SUBJECTS,
  SELLING_SIGNALS,
  SPELLED_VALUE,
} from './rules/claimsLexicon'

const scanOf = (id: string) => {
  const rule = claimsRules.find((candidate) => candidate.id === id)
  if (!rule) throw new Error(`rule ${id} not found`)
  return rule.scan
}

// The frame is neutral: it contains no phrase from any list, so the
// control proves the rule fires on the entry, not on the sentence
// around it.
const slop = (phrase: string) => `Here is the proof: ${phrase} and more words here.`
const control = 'Here is the proof: plain ordinary words and more words here.'

describe('F69: every claims phrase entry fires, and the frame alone does not', () => {
  const cases = [
    { id: 'social-proof', phrases: SOCIAL_PROOF_PHRASES },
    { id: 'testimonial-cliche', phrases: TESTIMONIAL_PHRASES },
    { id: 'vague-superlative', phrases: SUPERLATIVE_PHRASES },
    { id: 'fake-authority', phrases: FAKE_AUTHORITY_PHRASES },
  ] as const

  for (const { id, phrases } of cases) {
    it(`${id}: all ${phrases.length} entries fire in a slop sentence`, () => {
      const scan = scanOf(id)
      expect(scan(control)).toEqual([])
      for (const phrase of phrases) {
        expect(scan(slop(phrase)).length, phrase).toBeGreaterThan(0)
      }
    })
  }

  it('keeps the pre-move entry counts (a dropped entry fails here)', () => {
    expect(SOCIAL_PROOF_PHRASES).toHaveLength(14)
    expect(FAKE_AUTHORITY_PHRASES).toHaveLength(20)
    expect(TESTIMONIAL_PHRASES).toHaveLength(19)
    expect(SUPERLATIVE_PHRASES).toHaveLength(17)
    expect(CLAIM_VERBS.size).toBe(30)
    expect(REPORTING_SUBJECTS.size).toBe(50)
    expect(CHANGE_VERBS.size).toBe(37)
    expect(SELLING_SIGNALS.size).toBe(17)
    expect(BOAST_ADJECTIVES.size).toBe(8)
    expect(CLAIM_NOUNS.size).toBe(31)
    expect(Object.keys(MAGNITUDE_VALUE)).toHaveLength(4)
    expect(Object.keys(SPELLED_VALUE)).toHaveLength(29)
  })
})
