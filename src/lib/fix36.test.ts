// @vitest-environment happy-dom
// F36 — @media evaluated against a desktop viewport: mobile-only
// and dark-mode rules no longer inflate the desktop style signals.
import { describe, expect, it } from 'vitest'
import { analyzeSite } from './siteAnalyzer'

const wrap = (body: string, head = '') => `<!doctype html>
<html>
  <head>
    <title>Probe</title>
    <meta name="description" content="A probe page for the F36 checks." />
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

describe('F36: @media desktop evaluation', () => {
  it('does not count mobile-only and dark-mode pill rules (the audit probe)', () => {
    const html = wrap(
      `<p class="mobile dark desktop">Text.</p>`,
      `<style>
        @media (max-width: 600px) { .mobile { border-radius: 999px; } }
        @media (prefers-color-scheme: dark) { .dark { border-radius: 999px; } }
        .desktop { border-radius: 999px; }
      </style>`,
    )
    // One desktop rule only — below the threshold of 3.
    expect(groupOf(html, 'pill-radius')).toBeUndefined()
  })

  it('counts the same three rules when they are not inside @media', () => {
    const html = wrap(
      `<p class="mobile dark desktop">Text.</p>`,
      `<style>
        .mobile { border-radius: 999px; }
        .dark { border-radius: 999px; }
        .desktop { border-radius: 999px; }
      </style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('counts rules inside a matching desktop query', () => {
    const html = wrap(
      `<p class="a b c">Text.</p>`,
      `<style>
        @media (min-width: 1024px) { .a { border-radius: 999px; } }
        @media screen and (min-width: 800px) and (orientation: landscape) { .b { border-radius: 999px; } }
        @media (width >= 600px) { .c { border-radius: 999px; } }
      </style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('skips rules inside non-matching queries', () => {
    const html = wrap(
      `<p class="a b c d e f">Text.</p>`,
      `<style>
        @media (min-width: 1400px) { .a { border-radius: 999px; } }
        @media (orientation: portrait) { .b { border-radius: 999px; } }
        @media (prefers-reduced-motion: reduce) { .c { border-radius: 999px; } }
        @media (hover: none) { .d { border-radius: 999px; } }
        @media not screen { .e { border-radius: 999px; } }
        @media (600px <= width < 900px) { .f { border-radius: 999px; } }
      </style>`,
    )
    expect(groupOf(html, 'pill-radius')).toBeUndefined()
  })

  it('counts a rule when any query in a list matches', () => {
    const html = wrap(
      `<p class="a b c d">Text.</p>`,
      `<style>
        @media (max-width: 600px), screen and (min-width: 1024px) { .a { border-radius: 999px; } }
        @media print, (min-width: 1024px) { .b { border-radius: 999px; } }
        @media (max-width: 600px), (min-width: 2000px) { .c { border-radius: 999px; } }
        @media (orientation: landscape), (max-width: 100px) { .d { border-radius: 999px; } }
      </style>`,
    )
    // .a, .b and .d match through one query in their list; .c matches
    // neither. Three signals reach the threshold.
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('still skips @media print and @media speech', () => {
    const html = wrap(
      `<p class="a b c">Text.</p>`,
      `<style>
        @media print { .a { border-radius: 999px; } }
        @media speech { .b { border-radius: 999px; } }
        .c { border-radius: 999px; }
      </style>`,
    )
    expect(groupOf(html, 'pill-radius')).toBeUndefined()
  })

  it('does not drop rules for a query it cannot judge', () => {
    const html = wrap(
      `<p class="a b c">Text.</p>`,
      `<style>
        @media (unknown-feature: 1) { .a { border-radius: 999px; } }
        @media (min-width: 10furlongs) { .b { border-radius: 999px; } }
        .c { border-radius: 999px; }
      </style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('does not resolve custom properties defined only inside a mobile query', () => {
    const html = wrap(
      `<p class="a b c">Text.</p>`,
      `<style>
        @media (max-width: 600px) { :root { --brand: #8b5cf6; } }
        .a { color: var(--brand); }
        .b { color: purple; }
        .c { color: purple; }
      </style>`,
    )
    // .a resolves to nothing (--brand is mobile-only); .b and .c count.
    expect(occurrencesOf(html, 'blue-purple-palette')).toBe(2)
  })

  it('resolves custom properties defined inside a matching desktop query', () => {
    const html = wrap(
      `<p class="a b c">Text.</p>`,
      `<style>
        @media (min-width: 1024px) { :root { --brand: #8b5cf6; } }
        .a { color: var(--brand); }
        .b { color: purple; }
        .c { color: purple; }
      </style>`,
    )
    expect(occurrencesOf(html, 'blue-purple-palette')).toBe(3)
  })
})
