// @vitest-environment happy-dom
// Stage 6 follow-up from stage 5: the SiteResultPanel "Plus N more"
// line must reflect the true occurrence count, not the number of
// hits shown — the display list is sliced at 400/400/300, so 500
// dead links show 400 hits but 499 more occurrences than the one
// excerpt above.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { analyzeSite } from '../lib/siteAnalyzer'
import { SiteResultPanel } from './SiteResultPanel'

const wrap = (body: string) => `<!doctype html>
<html>
  <head><title>Probe</title></head>
  <body><h1>Probe</h1>${body}</body>
</html>`

const deadLinks = (count: number) =>
  wrap(
    Array.from({ length: count }, (_, i) => `<a href="#">Link ${i + 1}</a>`).join('\n'),
  )

const rendered = (html: string) => {
  const analysis = analyzeSite({ url: 'https://example.com/', html })
  return renderToString(
    <SiteResultPanel status="done" analysis={analysis} targetUrl="https://example.com/" />,
  )
}

describe('stage6: SiteResultPanel Plus N more counts true occurrences', () => {
  it('says Plus 499 more for 500 dead links shown as 400 hits', () => {
    const html = rendered(deadLinks(500))
    expect(html).toContain('Plus 499 more instances in the page.')
    expect(html).not.toContain('Plus 399 more')
  })

  it('says Plus 24 more for 25 dead links, where nothing is sliced', () => {
    const html = rendered(deadLinks(25))
    expect(html).toContain('Plus 24 more instances in the page.')
  })

  it('shows no Plus line for a single occurrence', () => {
    const html = rendered(deadLinks(1))
    expect(html).not.toContain('Plus')
  })
})
