// @vitest-environment happy-dom
// F39 — aria-labelledby with multiple IDs: the whole value was passed
// to getElementById, which can never match an id containing a space,
// so the control was wrongly flagged unnamed.
import { describe, expect, it } from 'vitest'
import { analyzeSite } from './siteAnalyzer'

const wrap = (body: string, head = '') => `<!doctype html>
<html>
  <head>
    <title>Probe</title>
    <meta name="description" content="A probe page for the F39 checks." />
    ${head}
  </head>
  <body>
    <h1>Probe</h1>
    ${body}
  </body>
</html>`

const groupOf = (html: string, id: string, stylesheets: string[] = []) => {
  const result = analyzeSite({ url: 'https://example.com/', html, stylesheets })
  return [...result.structure, ...result.style].find((item) => item.rule.id === id)
}

const occurrencesOf = (html: string, id: string, stylesheets: string[] = []) =>
  groupOf(html, id, stylesheets)?.occurrences ?? 0

describe('F39: aria-labelledby with multiple IDs', () => {
  it('does not flag a button labelled by two existing ids (the audit probe)', () => {
    const html = wrap(
      `<h2 id="billing-heading">Billing</h2>
       <p id="plan-tier">Pro plan</p>
       <button aria-labelledby="billing-heading plan-tier"></button>`,
    )
    expect(groupOf(html, 'unnamed-control')).toBeUndefined()
  })

  it('names the button from the second id when the first has no text', () => {
    const html = wrap(
      `<p id="empty"></p>
       <p id="plan-tier">Pro plan</p>
       <button aria-labelledby="empty plan-tier"></button>`,
    )
    expect(groupOf(html, 'unnamed-control')).toBeUndefined()
  })

  it('still flags a button whose labelledby ids do not exist', () => {
    const html = wrap(`<button aria-labelledby="missing-one missing-two"></button>`)
    expect(occurrencesOf(html, 'unnamed-control')).toBe(1)
  })

  it('keeps the single-id case working', () => {
    const html = wrap(
      `<p id="plan-tier">Pro plan</p>
       <button aria-labelledby="plan-tier"></button>`,
    )
    expect(groupOf(html, 'unnamed-control')).toBeUndefined()
  })
})
