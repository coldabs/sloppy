// @vitest-environment happy-dom
// F38 — hidden text scored as visible copy: [hidden],
// aria-hidden, and inline display:none / visibility:hidden are
// excluded from the copy analysis.
import { describe, expect, it } from 'vitest'
import { analyzeSite } from './siteAnalyzer'

const wrap = (body: string, head = '') => `<!doctype html>
<html>
  <head>
    <title>Probe</title>
    <meta name="description" content="A probe page for the F38 checks." />
    ${head}
  </head>
  <body>
    <h1>Probe</h1>
    ${body}
  </body>
</html>`

describe('F38: hidden text is not scored as visible copy', () => {
  it('counts only the 8 visible words from the audit probe', () => {
    const html = wrap(
      `<p>Hello world, this is the real page copy.</p>
       <div style="display:none">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.</div>
       <div hidden>Act now, limited time only, last chance, offer ends today, while supplies last, today only.</div>
       <div aria-hidden="true">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod.</div>`,
    )
    const result = analyzeSite({ url: 'https://example.com/', html })
    // 8 visible words plus the h1 "Probe" = 9.
    expect(result.copy.words).toBe(9)
    expect(result.structure.find((item) => item.rule.id === 'placeholder-copy')).toBeUndefined()
    expect(result.structure.find((item) => item.rule.id === 'fake-urgency')).toBeUndefined()
    expect(result.score).not.toBeNull()
    expect(result.score as number).toBeGreaterThanOrEqual(70)
  })

  it('excludes visibility:hidden and hidden ancestors with visible descendants', () => {
    const html = wrap(
      `<p style="visibility:hidden">Lorem ipsum dolor sit amet consectetur adipiscing elit.</p>
       <div hidden><p>Act now, limited time only, last chance, offer ends today.</p></div>
       <p>Plain visible copy with no flags at all in it.</p>`,
    )
    const result = analyzeSite({ url: 'https://example.com/', html })
    expect(result.structure.find((item) => item.rule.id === 'placeholder-copy')).toBeUndefined()
    expect(result.structure.find((item) => item.rule.id === 'fake-urgency')).toBeUndefined()
  })

  it('still counts visible copy identically when nothing is hidden', () => {
    const html = wrap(
      `<p>Hello world, this is the real page copy.</p>
       <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>`,
    )
    const result = analyzeSite({ url: 'https://example.com/', html })
    expect(result.copy.words).toBe(9 + 8)
    expect(result.structure.find((item) => item.rule.id === 'placeholder-copy')).not.toBeUndefined()
  })
})
