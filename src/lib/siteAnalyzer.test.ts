// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { analyzeSite } from './siteAnalyzer'

const ruleIds = (html: string, stylesheets: string[] = []) => {
  const result = analyzeSite({ url: 'https://example.com/', html, stylesheets })
  return [...result.structure, ...result.style].map((group) => group.rule.id)
}

const cleanPage = `<!doctype html>
<html>
  <head>
    <title>Plan prices</title>
    <meta name="description" content="Three plans, the work each one covers, and the monthly price." />
  </head>
  <body>
    <h1>Prices</h1>
    <p>The base plan costs 12 dollars per month.</p>
    <a href="#prices">Jump to prices</a>
    <h2 id="prices">Prices</h2>
    <img src="/chart.png" alt="A bar chart of the three plan prices." />
  </body>
</html>`

const sloppyPage = `<!doctype html>
<html>
  <head>
    <title>Revolutionary AI-Powered Platform</title>
  </head>
  <body>
    <h1>Welcome</h1>
    <h3>Trusted by</h3>
    <img src="a.png" /><img src="b.png" /><img src="c.png" />
    <a href="#">Get started</a>
    <a href="#missing">Learn more</a>
    <button></button>
    <section>
      <h2>How it works</h2>
      <ol><li>One</li><li>Two</li><li>Three</li></ol>
    </section>
    <p>Limited time offer. Lorem ipsum dolor sit amet.</p>
    <section>
      <h2>Pricing</h2>
      <p>The most popular plan costs $19 per month.</p>
    </section>
    <p>Our revolutionary AI-powered platform is seamless and effortless.</p>
    <div class="a b c d e f g h i j"></div>
    <style>
      .a { border-radius: 999px; }
      .b { border-radius: 120px; }
      .c { border-radius: 60rem; }
      .d { backdrop-filter: blur(8px); }
      .e { backdrop-filter: blur(12px); }
      .f { -webkit-backdrop-filter: blur(16px); }
      .g { background: radial-gradient(red, blue), radial-gradient(red, blue); }
      .h { color: #7c3aed; }
      .i { color: indigo; }
      .j { background-image: repeating-linear-gradient(#fff 0 1px, transparent 1px 8px); }
    </style>
  </body>
</html>`

describe('analyzeSite', () => {
  it('returns a clean score for a plain static page', () => {
    const result = analyzeSite({ url: 'https://example.com/', html: cleanPage })
    expect(result.structure).toHaveLength(0)
    expect(result.style).toHaveLength(0)
    expect(result.copy.findings).toHaveLength(0)
    expect(result.score).toBe(100)
    expect(result.verdict).toBe('Clean enough')
    expect(result.title).toBe('Plan prices')
  })

  it('detects the site patterns in a slop fixture', () => {
    const ids = ruleIds(sloppyPage)
    expect(ids).toEqual(
      expect.arrayContaining([
        'dead-link',
        'unnamed-control',
        'missing-alt',
        'heading-order',
        'template-stack',
        'trust-logo-bar',
        'three-step',
        'fake-urgency',
        'placeholder-copy',
        'popular-badge',
        'meta-description',
        'pill-radius',
        'glass-surfaces',
        'radial-orbs',
        'blue-purple-palette',
        'background-grid',
      ]),
    )
  })

  it('runs the copy rules over the visible page text', () => {
    const result = analyzeSite({ url: 'https://example.com/', html: sloppyPage })
    expect(result.copy.findings.length).toBeGreaterThan(0)
    expect(result.copy.findings.some((finding) => finding.ruleId === 'buzzwords')).toBe(true)
    expect(result.copyText).toContain('revolutionary')
  })

  it('scores a sloppy page lower than a clean page', () => {
    const sloppy = analyzeSite({ url: 'https://example.com/', html: sloppyPage })
    const clean = analyzeSite({ url: 'https://example.com/', html: cleanPage })
    // Both fixtures have headings, so both get a numeric score.
    expect(sloppy.score).not.toBeNull()
    expect(clean.score).not.toBeNull()
    expect(sloppy.score as number).toBeLessThan(clean.score as number)
    expect(sloppy.counts.high).toBeGreaterThan(0)
  })

  it('does not flag anchors that resolve', () => {
    const html = `<html><head><title>Doc</title><meta name="description" content="A page." /></head><body><h1>Doc</h1><a href="#part">Jump</a><h2 id="part">Part</h2></body></html>`
    expect(ruleIds(html)).not.toContain('dead-link')
  })

  it('includes fetched stylesheet text in the style checks', () => {
    const html = `<html><head><title>Doc</title><meta name="description" content="A page." /></head><body><h1>Doc</h1><p class="a b c d e">Doc</p></body></html>`
    const css = `
      .a { backdrop-filter: blur(6px); }
      .b { backdrop-filter: blur(7px); }
      .c { backdrop-filter: blur(8px); }
      .d { color: #8b5cf6; }
      .e { color: purple; }
    `
    expect(ruleIds(html, [css])).toEqual(
      expect.arrayContaining(['glass-surfaces', 'blue-purple-palette']),
    )
  })

  it('reports measured stats', () => {
    const result = analyzeSite({ url: 'https://example.com/', html: sloppyPage, stylesheets: ['x'] })
    expect(result.stats.links).toBe(2)
    expect(result.stats.deadLinks).toBe(2)
    expect(result.stats.images).toBe(3)
    expect(result.stats.missingAlt).toBe(3)
    expect(result.stats.stylesheets).toBe(1)
    expect(result.stats.headings).toBe(4)
  })

  it('flags a page with no title or description', () => {
    const ids = ruleIds('<html><body><h1>Hello</h1></body></html>')
    expect(ids).toContain('page-title')
    expect(ids).toContain('meta-description')
  })
})
