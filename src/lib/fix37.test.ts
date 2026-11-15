// @vitest-environment happy-dom
// F37 — fragile selector matching: bare attribute selectors assumed
// used, selector lists split on commas inside parens/quotes, nested
// pseudo parentheses breaking the strip regex.
import { describe, expect, it } from 'vitest'
import { analyzeSite } from './siteAnalyzer'

const wrap = (body: string, head = '') => `<!doctype html>
<html>
  <head>
    <title>Probe</title>
    <meta name="description" content="A probe page for the F37 checks." />
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

describe('F37: selector matching', () => {
  it('does not count bare attribute selectors that match nothing (the audit probe)', () => {
    const html = wrap(
      `<p>Plain text, no data-label anywhere.</p>`,
      `<style>
        [data-label="a, b"] { border-radius: 999px; }
        [data-label="c, d"] { border-radius: 999px; }
        [data-label="e, f"] { border-radius: 999px; }
      </style>`,
    )
    expect(groupOf(html, 'pill-radius')).toBeUndefined()
  })

  it('counts the same attribute selectors when the attribute is present', () => {
    const html = wrap(
      `<p data-label="a, b">One</p><p data-label="c, d">Two</p><p data-label="e, f">Three</p>`,
      `<style>
        [data-label="a, b"] { border-radius: 999px; }
        [data-label="c, d"] { border-radius: 999px; }
        [data-label="e, f"] { border-radius: 999px; }
      </style>`,
    )
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('counts a nested :not() selector when its base class is used', () => {
    const html = wrap(
      `<div class="card-a">One</div><div class="card-b">Two</div><div class="card-c">Three</div>`,
      `<style>
        .card-a:not(.x:not(.y)) { border-radius: 999px; }
        .card-b:not(.x:not(.y)) { border-radius: 999px; }
        .card-c:not(.x:not(.y)) { border-radius: 999px; }
      </style>`,
    )
    // The old strip regex left a dangling `)` here, so querySelector
    // threw and the token fallback (requiring .x and .y too) said no.
    expect(occurrencesOf(html, 'pill-radius')).toBe(3)
  })

  it('keeps :root custom properties resolving', () => {
    const html = wrap(
      `<p class="a b c">Text.</p>`,
      `<style>
        :root { --brand: #8b5cf6; }
        .a { color: var(--brand); }
        .b { color: purple; }
        .c { color: #6366f1; }
      </style>`,
    )
    expect(occurrencesOf(html, 'blue-purple-palette')).toBe(3)
  })

  it('does not count a rule whose class token is absent from the DOM', () => {
    const html = wrap(
      `<p>Plain text.</p>`,
      `<style>
        .ghost-a { border-radius: 999px; }
        .ghost-b { border-radius: 999px; }
        .ghost-c { border-radius: 999px; }
      </style>`,
    )
    expect(groupOf(html, 'pill-radius')).toBeUndefined()
  })
})
