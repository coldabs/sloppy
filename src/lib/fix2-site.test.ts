// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { analyzeSite } from './siteAnalyzer'

const styleOnlyPage = `<!doctype html>
<html>
  <head>
    <title>Notes</title>
    <meta name="description" content="Short notes on the week." />
  </head>
  <body>
    <h1>Notes</h1>
    <p class="a b c d e">The meeting moved to Thursday. Bring the draft.</p>
    <style>
      .a { backdrop-filter: blur(8px); }
      .b { backdrop-filter: blur(8px); }
      .c { backdrop-filter: blur(8px); }
      .d { color: #7c3aed; }
      .e { color: indigo; }
    </style>
  </body>
</html>`

const deadLinksPage = `<!doctype html>
<html>
  <head>
    <title>Links</title>
    <meta name="description" content="A page of links." />
  </head>
  <body>
    <h1>Links</h1>
    ${Array.from({ length: 20 }, (_, i) => `<a href="#missing-${i + 1}">Link ${i + 1}</a>`).join('\n')}
  </body>
</html>`

describe('fix2: F-26 site rules count every occurrence', () => {
  it('reports the true dead-link count instead of stopping at 8', () => {
    const result = analyzeSite({ url: 'https://example.com/', html: deadLinksPage })
    expect(result.stats.deadLinks).toBe(20)
    const group = result.structure.find((item) => item.rule.id === 'dead-link')
    expect(group?.occurrences).toBe(20)
    expect(group?.hits).toHaveLength(20)
  })
})

describe('fix2: F-27 style signals cannot decide a page alone', () => {
  it('scores a clean page with glass blur and an indigo palette at 76, not 52', () => {
    const result = analyzeSite({ url: 'https://example.com/', html: styleOnlyPage })
    expect(result.copy.score).toBe(100)
    expect(result.score).toBe(76)
  })
})

describe('fix2: F-33 the 60,000-character site limit is visible', () => {
  it('flags a long page as truncated and scans only the first 60,000 characters', () => {
    const longPage = `<!doctype html><html><head><title>T</title><meta name="description" content="D." /></head><body><h1>T</h1><p>${'word '.repeat(20000)}</p></body></html>`
    const result = analyzeSite({ url: 'https://example.com/', html: longPage })
    expect(result.textTruncated).toBe(true)
    expect(result.copyText.length).toBe(60000)
  })

  it('does not flag a short page as truncated', () => {
    const result = analyzeSite({ url: 'https://example.com/', html: styleOnlyPage })
    expect(result.textTruncated).toBe(false)
  })
})
