import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'

// F24 (2026-11-15): thin-substance was spoofed by capitalizing any
// word mid-sentence — "Founders", "Seamless", "Next-Gen" all counted
// as concrete proper names and exempted the paragraph. A bare
// capitalised word is not a fact on its own: a name only counts
// alongside a number or a cause (the way a cause already needs a
// number or a name in its sentence). The buzzword-vocabulary
// exclusion alone would not fix it — the spoof capitalizes ordinary
// words ("Founders", "Modern"), not just listed buzzwords.
describe('F24: thin-substance capitalization spoof', () => {
  const spoof =
    'We help Founders build Seamless workflows with Next-Gen automation and Revolutionary tools for Modern teams everywhere today. Our platform delivers Cutting-Edge solutions that Transform the way Leaders work together.\n\nThe Transformative solution empowers Leaders to Unlock potential and Drive growth with World-Class support every day. Thousands of Innovators trust our Groundbreaking technology to Supercharge their workflows and Elevate results.\n\nJoin Modern teams who use Seamless automation to Build better products and Ship faster every single week. The Future is bright and the possibilities are endless for everyone involved.'
  const lower = spoof.toLowerCase()

  it('fires thin-substance on Title-Cased buzzwords, as on lowercase', () => {
    const spoofResult = analyze(spoof)
    const lowerResult = analyze(lower)
    expect(
      spoofResult.findings.filter((f) => f.ruleId === 'thin-substance'),
    ).toHaveLength(3)
    expect(spoofResult.score).toBe(lowerResult.score)
    expect(spoofResult.score).toBe(27)
  })

  it('still passes a paragraph with a name and a number', () => {
    const text =
      'Ana from support answered 40 tickets, most of them about the new login page. Ana answered 40 tickets and closed 12 of them the same day.\n\nMarek in Berlin tested every page twice and fixed 14 bugs. The release shipped version 2.1 on Friday.\n\nLinz takes over the migration in June and the handover covers 3 teams. The plan lists 5 steps for the move.'
    expect(analyze(text).findings.map((f) => f.ruleId)).not.toContain(
      'thin-substance',
    )
  })

  it('fires on paragraphs that only name people, with no number or cause', () => {
    // Documented trade-off: a name on its own is not a concrete fact,
    // so a paragraph that only names people (no number, no cause) is
    // substance-poor by the rule's definition.
    const text =
      'Ana from support answered the tickets and closed them the same day. She wrote back to every customer and the team was happy with the quick reply.\n\nMarek in Berlin tested every page twice and fixed the last bugs before the release. The release went out on time and the users were pleased with the result.\n\nLinz takes over the migration next month and the handover is planned for the whole team. The team meets on Monday to review the plan together in the office.'
    expect(
      analyze(text).findings.filter((f) => f.ruleId === 'thin-substance'),
    ).toHaveLength(3)
  })

  it('still counts a cause tied to a name as a fact', () => {
    const text =
      'The migration finished because Ana from support rewrote the queue by hand. The new code runs in half the time it used to take.\n\nThe launch worked because Marek in Berlin tested every page twice. The team fixed the last bugs on Friday and shipped on Monday.\n\nLatency fell because the team cut the payload from 400ms to 90ms. The change shipped on Tuesday and the queue stayed short.'
    expect(analyze(text).findings.map((f) => f.ruleId)).not.toContain(
      'thin-substance',
    )
  })
})
